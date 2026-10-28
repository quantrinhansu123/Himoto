<?php
// Run inside the legacy host. All application database work is read-only.
require '/var/www/app.himoto.vn/vendor/autoload.php';
$app = require '/var/www/app.himoto.vn/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require __DIR__.'/RentalIntegrityService.php';
require __DIR__.'/VehicleRentalIntegrityController.php';
class IntegrityFixture extends App\Http\Services\RentalIntegrityService {
    public $offline=false;
    public function compare(array $licenses) {
        if ($this->offline) return ['available'=>false,'checked_at'=>null,'rows'=>[]];
        $rows=[];foreach($licenses as $license){$id=preg_replace('/[^A-Z0-9]/','',strtoupper($license));$rows[$id]=['license'=>$id,'found'=>in_array($id,['19G142319','89AB59149']),
            'active_count'=>$id==='19G142319'?1:0,'named_count'=>$id==='19G142319'?1:0,'other_open_count'=>0];}
        return ['available'=>true,'checked_at'=>gmdate('c'),'rows'=>$rows];
    }
}
function ensure($value,$message){if(!$value)throw new RuntimeException($message);}
function requestFor($role,$store,$params=[]) {
    $request=Illuminate\Http\Request::create('/api/auth/vehicle/rental-integrity','GET',$params);
    $request->setUserResolver(function()use($role,$store){return $role===null?null:(object)['id'=>1,'role_id'=>$role,'store_id'=>$store];});return $request;
}
Illuminate\Support\Facades\DB::statement('SET SESSION TRANSACTION READ ONLY');
Illuminate\Support\Facades\DB::beginTransaction();
try {
 $service=new IntegrityFixture();$report=$service->report(28,false);
 $plates=array_column($report['rows'],null,'license');ensure(isset($plates['19G1-423.19'],$plates['89AB-591.49']),'Láng source fixtures changed; inspect before deploying');
 ensure($plates['19G1-423.19']['level']==='info','Existing new-app contract cannot be flagged missing');ensure($plates['89AB-591.49']['level']==='warning','Unlinked vehicle needs inspection');
 $all=$service->report(null,false);$closed=$service->report(null,true);ensure(count($closed['rows'])>=count($all['rows']),'Closed stores must be separately selectable');
 $service->offline=true;$offline=$service->report(28,false);foreach($offline['rows']as$row)ensure($row['level']==='unknown','Disconnected bridge must not claim no contract');$service->offline=false;
 $controller=new App\Http\Controllers\Vehicle\VehicleRentalIntegrityController();
 ensure($controller->index(requestFor(null,null),$service)->getStatusCode()===401,'Anonymous must be denied');
 ensure($controller->index(requestFor(2,28,['store_id'=>'23']),$service)->getStatusCode()===403,'Foreign branch must be denied');
 ensure($controller->index(requestFor(2,null),$service)->getStatusCode()===403,'Unscoped non-admin must be denied');
 ensure($controller->index(requestFor(1,null,['store_id'=>'bad']),$service)->getStatusCode()===400,'Invalid store must be denied');
 $branch=$controller->index(requestFor(2,28),$service);ensure($branch->getStatusCode()===200,'Own branch must work');
 foreach(json_decode($branch->getContent(),true)['data']['rows']as$row)ensure($row['store_name']==='264 Đường Láng','Branch report leaked another store');
 ensure($controller->index(requestFor(1,null,['include_closed'=>'1']),$service)->getStatusCode()===200,'Admin can include closed stores');
 echo json_encode(['passed'=>7,'checked_open'=>$all['checked_count'],'alerts_open'=>count($all['rows']),'alerts_with_closed'=>count($closed['rows']),'readOnly'=>true,'realBusinessWrites'=>0,'realTelegramRequests'=>0],JSON_UNESCAPED_UNICODE)."\n";
} finally {Illuminate\Support\Facades\DB::rollBack();}
