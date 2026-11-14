"""Inspect the real APK bytes, without environment files or credentials."""
import hashlib,re,zipfile
from .mobile_dex import has_constructor
def verify_bundle(apk,require_offline=False):
    with zipfile.ZipFile(apk) as archive:
        names=archive.namelist();bundle=archive.read('assets/index.android.bundle')
        assert b'https://himoto.vercel.app' in bundle,'Production API is absent from the compiled bundle'
        assert b'mobile-api.example.invalid' not in bundle and b'http://127.0.0.1:8091' not in bundle,'QA API is present in the compiled bundle'
        assert not any(n.lower().endswith(('.p12','.jks','.keystore','.key','.env.local')) for n in names),'Private configuration unexpectedly packaged'
        classes=[n for n in names if n.startswith('classes') and n.endswith('.dex')]
        dex=b''.join(archive.read(n) for n in classes)
        native_features={name:marker in dex for name,marker in [('sqlite',b'expo/modules/sqlite/'),('biometric',b'expo/modules/localauthentication/'),('location',b'expo/modules/location/'),('backgroundTask',b'expo/modules/backgroundtask/')]}
        native_features['sqlCipher']=any(b'cipher_version' in archive.read(n) for n in names if n.startswith('lib/arm64-v8a/') and 'sqlite' in n.lower() and n.endswith('.so'))
        native_features['workDatabaseConstructor']=any(has_constructor(archive.read(n),'Landroidx/work/impl/WorkDatabase_Impl;') for n in classes)
        video_descriptor='Lvn/himoto/video/HimotoVideoModule;'
        mapping=apk.parent/'r8-mapping.txt'
        if mapping.is_file():
            mapped=re.search(r'^vn\.himoto\.video\.HimotoVideoModule -> ([A-Za-z0-9_.$]+):$',mapping.read_text(encoding='utf-8'),re.M)
            if mapped:video_descriptor='L'+mapped[1].replace('.','/')+';'
        # R8 may rename a directly registered Expo module. Verify its actual
        # defined constructor using this build's mapping, not a class-name string.
        native_features['himotoVideo']=b'HimotoVideo' in dex and any(has_constructor(archive.read(n),video_descriptor) for n in classes)
        native_features['transformerApiBoundary']=all(name in dex for name in (
            b'androidx/media3/transformer/DefaultAssetLoaderFactory;',
            b'androidx/media3/transformer/ExoPlayerAssetLoader$Factory;',
            b'androidx/media3/transformer/TransformerInternal$SequenceAssetLoaderListener;'))
        if require_offline:assert all(native_features.values()),'Required final-release native modules absent: '+str(native_features)
        assert any(b'expo/modules/notifications/' in archive.read(n) for n in classes),'Native notifications module absent'
        resources=archive.read('resources.arsc')
        assert b'himoto-70f21' in resources or 'himoto-70f21'.encode('utf-16le') in resources,'Wrong native Firebase project'
        assert b'1074135885293' in resources or '1074135885293'.encode('utf-16le') in resources,'Wrong FCM sender ID'
        abis=sorted({n.split('/')[1] for n in names if n.startswith('lib/') and n.endswith('.so')})
        assert 'arm64-v8a' in abis
        return {'ok':True,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'bundleSha256':hashlib.sha256(bundle).hexdigest(),
                'bundleBytes':len(bundle),'apiOrigin':'https://himoto.vercel.app','firebaseProjectId':'himoto-70f21','nativePushModulePresent':True,'nativeFeatures':native_features,'abis':abis,'privateKeyFiles':0}
