"""Focused signed-APK reinstall and native XLSX storage acceptance."""
import hashlib
import json
import re
import time
import zipfile


def run(qa,args,wait,reveal,press,enter,launch,tab,logout):
    qa.command('shell','am','force-stop','vn.himoto.staff')
    installed=qa.command('install','-r','--no-streaming',str(args.release_apk.resolve()))
    assert'Success'in installed
    launch();wait('Lập hợp đồng',100);tab('Tài khoản');wait('Phạm vi truy cập');reveal('Toàn bộ cơ sở')
    qa.screenshot('02-same-signature-reinstall-kept-session')
    tab('Đội xe');reveal('Tìm đội xe',True);enter('Tìm đội xe','QA-HANDOFF-XLSX-NO-REAL-RECORDS-20261105')
    # Stable empty filter exercises the actual export/storage path without
    # downloading operational vehicle records or customer data.
    wait('Không có kết quả',40)
    press('Tải Excel theo bộ lọc');wait('Chọn tất cả cột',90)
    labels=[n.get('text','')or n.get('content-desc','')for n in qa.tree().iter('node')if n.get('package')=='vn.himoto.staff']
    download=[label for label in labels if re.fullmatch(r'Tải Excel với \d+ cột',label)]
    assert len(set(download))==1
    download=download[0];qa.screenshot('03-empty-filter-export-columns')
    folder='ReleaseExport-'+args.output.name
    target='/sdcard/Download/HimotoQA/'+folder
    qa.command('shell','mkdir','-p',target)
    assert not qa.command('shell','ls','-1',target).strip(),'Use the empty dedicated release QA folder'
    press(download)
    allowed=('com.android.documentsui','com.google.android.documentsui','com.android.packageinstaller','com.google.android.packageinstaller','android')
    def system_press(labels,timeout=35):
        until=time.monotonic()+timeout
        while time.monotonic()<until:
            nodes=[n for n in qa.tree().iter('node')if n.get('package')in allowed and(n.get('text')in labels or n.get('content-desc')in labels)and n.get('enabled')=='true']
            buttons=[n for n in nodes if n.get('clickable')=='true'];nodes=buttons or nodes
            if nodes:
                x1,y1,x2,y2=map(int,re.findall(r'\d+',nodes[-1].get('bounds')));qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));return
        raise RuntimeError('QA_SYSTEM_EXPORT_CONTROL_MISSING')
    system_press(['HimotoQA']);system_press([folder])
    system_press(['USE THIS FOLDER','Use this folder','SELECT','Select','CHỌN','CHỌN THƯ MỤC','SỬ DỤNG THƯ MỤC NÀY'])
    until=time.monotonic()+60;saved=None
    while time.monotonic()<until:
        tree=qa.tree()
        labels=[n.get('text','')for n in tree.iter('node')if n.get('package')=='vn.himoto.staff'and n.get('text','').startswith('Đã lưu 0 dòng vào ')]
        if labels:saved=labels[0];break
        if any(n.get('package')in allowed and n.get('text')in('ALLOW','Allow','CHO PHÉP','Cho phép')for n in tree.iter('node')):system_press(['ALLOW','Allow','CHO PHÉP','Cho phép'])
    assert saved,'QA_XLSX_SAVE_NOT_CONFIRMED'
    reveal(saved,True);qa.screenshot('04-native-xlsx-saved')
    files=qa.command('shell','ls','-1',target).splitlines();assert len(files)==1 and re.fullmatch(r'himoto-vehicles-[0-9-]+\.xlsx',files[0])
    data=qa.command('exec-out','cat',target+'/'+files[0],binary=True)
    exported=qa.output/'exported-empty-vehicles.xlsx';exported.write_bytes(data)
    with zipfile.ZipFile(exported)as workbook:
        sheet=workbook.read('xl/worksheets/sheet1.xml').decode('utf-8');assert len(re.findall(r'<row\b',sheet))==1
        assert'autoFilter'in sheet and'frozen'in sheet
    qa.back();tab('Tài khoản');logout();launch();wait('Đăng nhập',100);qa.screenshot('05-focused-logout')
    return dict(ok=True,groups=['Signed release reinstall with adb install -r preserves authenticated SecureStore session','Actual live export of an empty bounded filter saves native XLSX through Android SAF and reopens with headers/freeze/autofilter','Focused release session is logged out after acceptance'],xlsxRows=0,operationalRowsExported=0,xlsxSha256=hashlib.sha256(data).hexdigest(),fileOnDevice=target+'/'+files[0],sameSignatureReinstall=True,screenshots=5)
