<?php
namespace App\Http\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class RentalIntegrityService
{
    public function report($storeId, $includeClosed = false)
    {
        $query = DB::table('vehicles as v')->leftJoin('stores as s', 's.id', '=', 'v.store_id')->where('v.status', 'using');
        if ($storeId) $query->where('v.store_id', $storeId);
        if (!$includeClosed) $query->where('s.status', 'opening');
        $vehicles = $query->select('v.id','v.license','v.name','v.store_id','s.store_name','s.status as store_status')->orderBy('v.id')->get();
        $ids = $vehicles->pluck('id')->all();
        $active = $ids ? DB::table('order_vehicle_details as d')->join('orders as o', 'o.id', '=', 'd.order_id')
            ->leftJoin('customers as c', 'c.id', '=', 'o.customer_id')->whereIn('d.vehicle_id', $ids)
            ->whereNull('d.deleted_at')->whereNull('d.completed_at')->whereNull('o.deleted_at')->whereNull('o.completed_at')
            ->whereIn('o.order_status', ['renting','bad_debt'])
            ->select('d.vehicle_id','o.id as order_id','c.name','o.customer_name')->get()->groupBy('vehicle_id') : collect();
        $candidates = [];
        foreach ($vehicles as $v) {
            $lines = $active->get($v->id, collect());
            $named = $lines->filter(function ($d) { return trim((string)$d->name) !== '' || trim((string)$d->customer_name) !== ''; });
            if (!$named->count()) $candidates[] = ['id'=>(int)$v->id,'license'=>$v->license,'name'=>$v->name,'store_name'=>$v->store_name,
                'store_status'=>$v->store_status,'local_active_count'=>$lines->pluck('order_id')->unique()->count(),
                'local_issue'=>$lines->count() ? 'Hợp đồng trên app cũ thiếu tên khách' : 'App cũ chưa có hợp đồng đang giữ xe'];
        }
        $comparison = $this->compare(array_column($candidates, 'license'));
        foreach ($candidates as &$row) {
            $key = preg_replace('/[^A-Z0-9]/', '', strtoupper($row['license']));
            $new = $comparison['rows'][$key] ?? null;
            $row['new_checked_at'] = $comparison['checked_at'];
            if (!$new) { $row['level']='unknown';$row['message']='Chưa đối chiếu được app mới. Cần kiểm tra lại trước khi xử lý xe.'; }
            elseif ($new['named_count'] > 0) { $row['level']='info';$row['message']='Đã có hợp đồng và tên khách trên app mới. Cần đối chiếu dữ liệu giữa hai app.'; }
            elseif ($new['active_count'] > 0) { $row['level']='warning';$row['message']='App mới có hợp đồng giữ xe nhưng thiếu tên khách. Cần bổ sung đúng hồ sơ khách.'; }
            elseif ($new['other_open_count'] > 0) { $row['level']='review';$row['message']='App mới có hồ sơ nháp / đặt cọc / bảo lưu. Cần kiểm tra tình trạng bàn giao xe.'; }
            elseif ($new['found']) { $row['level']='warning';$row['message']='Chưa thấy hợp đồng giữ xe trên cả hai app. Cần xác nhận xe đang ở kho hay ở khách.'; }
            else { $row['level']='review';$row['message']='Chưa có xe trong danh mục app mới. Cần rà hồ sơ cơ sở cũ và kiểm kê thực tế.'; }
        }
        unset($row);
        return ['checked_at'=>gmdate('c'),'new_checked_at'=>$comparison['checked_at'],'checked_count'=>$vehicles->count(),
            'rows'=>$candidates,'comparison_available'=>$comparison['available']];
    }

    public function compare(array $licenses)
    {
        if (!$licenses) return ['available'=>true,'checked_at'=>gmdate('c'),'rows'=>[]];
        $keyFile = config('rental_integrity.key_file','/etc/himoto/rental-integrity.key');
        $key = is_string($keyFile) && is_readable($keyFile) ? trim(file_get_contents($keyFile)) : '';
        if (strlen($key) < 32) return ['available'=>false,'checked_at'=>null,'rows'=>[]];
        $result = ['available'=>true,'checked_at'=>null,'rows'=>[]];
        foreach (array_chunk($licenses, 100) as $chunk) {
            $body = json_encode(['licenses'=>$chunk], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
            $cacheKey = 'rental-integrity-v1-'.hash('sha256', $key.$body);
            $cached = Cache::get($cacheKey);
            if (!is_array($cached) || !isset($cached['checked_at']) || strtotime($cached['checked_at']) < time()-60 || strtotime($cached['checked_at']) > time()+60) {
                $timestamp = (string)time();$nonce=bin2hex(random_bytes(16));
                $signed='';
                if (!openssl_sign($timestamp."\n".$nonce."\n".$body,$signed,$key,OPENSSL_ALGO_SHA256)) { $result['available']=false;continue; }
                $signature=base64_encode($signed);
                $curl=curl_init('https://himoto.vercel.app/api/internal/vehicle-rental-integrity');
                curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>7,
                    CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false,
                    CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-Himoto-Integrity-Timestamp: '.$timestamp,'X-Himoto-Integrity-Nonce: '.$nonce,'X-Himoto-Integrity-Signature: '.$signature]]);
                $raw=curl_exec($curl);$status=curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
                $response=is_string($raw)?json_decode($raw,true):null;
                $cached=$status===200 && ($response['status']??'')==='success' ? ($response['data']??null):null;
                if (is_array($cached) && isset($cached['checked_at'],$cached['rows']) && is_array($cached['rows']) && abs(time()-strtotime($cached['checked_at']))<=60) Cache::put($cacheKey,$cached,60);
                else $cached=null;
            }
            if (!$cached) { $result['available']=false;continue; }
            $result['checked_at']=$result['checked_at'] ? min($result['checked_at'],$cached['checked_at']) : $cached['checked_at'];
            foreach ($cached['rows'] as $row) {
                if (!is_array($row) || !isset($row['license'],$row['found'],$row['active_count'],$row['named_count'],$row['other_open_count'])) continue;
                $result['rows'][$row['license']]=$row;
            }
        }
        return $result;
    }
}
