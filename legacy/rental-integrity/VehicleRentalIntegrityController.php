<?php
namespace App\Http\Controllers\Vehicle;

use App\Http\Controllers\Controller;
use App\Http\Services\RentalIntegrityService;
use Illuminate\Http\Request;

class VehicleRentalIntegrityController extends Controller
{
    public function index(Request $request, RentalIntegrityService $service)
    {
        $user = $request->user();
        if (!$user) return response()->json(['status'=>'error'],401);
        $store = $request->query('store_id');
        if ($store !== null && $store !== '' && (!ctype_digit((string)$store) || (int)$store <= 0)) return response()->json(['status'=>'error','message'=>'Cơ sở không hợp lệ.'],400);
        $admin = (int)$user->role_id === 1;
        if (!$admin && (!(int)$user->store_id || ($store && (int)$store !== (int)$user->store_id))) return response()->json(['status'=>'error','message'=>'Không có quyền xem cơ sở này.'],403);
        $includeClosed = $admin && $request->query('include_closed') === '1';
        try {
            $data=$service->report($admin ? ($store ? (int)$store : null) : (int)$user->store_id,$includeClosed);
            return response()->json(['status'=>'success','data'=>$data])->header('Cache-Control','private, no-store');
        } catch (\Throwable $e) {
            return response()->json(['status'=>'error','message'=>'Không tải được cảnh báo xe. Vui lòng thử lại.'],503)->header('Cache-Control','private, no-store');
        }
    }
}
