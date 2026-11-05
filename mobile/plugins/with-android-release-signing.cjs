const {withAppBuildGradle}=require('expo/config-plugins');
const begin='// @generated begin himoto-release-signing';
const end='// @generated end himoto-release-signing';
function addReleaseSigning(contents,language){
 if(language!=='groovy')throw Error('Review Android Gradle language before configuring signing');
 const block=`${begin}
        release {
            def names = ['HIMOTO_ANDROID_KEYSTORE_PATH','HIMOTO_ANDROID_KEYSTORE_PASSWORD','HIMOTO_ANDROID_KEY_ALIAS','HIMOTO_ANDROID_KEY_PASSWORD']
            def ready = names.every { System.getenv(it) != null && !System.getenv(it).isEmpty() }
            if (ready) {
                storeFile file(System.getenv('HIMOTO_ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('HIMOTO_ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('HIMOTO_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('HIMOTO_ANDROID_KEY_PASSWORD')
            } else if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) {
                throw new GradleException('Himoto release signing credentials are required; use the release runner.')
            }
        }
        ${end}`;
 const previous=/\/\/ @generated begin himoto-release-signing[\s\S]*?\/\/ @generated end himoto-release-signing/g;
 if(contents.includes(begin)||contents.includes(end)){
  if((contents.match(previous)||[]).length!==1||contents.split(begin).length!==2||contents.split(end).length!==2)throw Error('Review incomplete release signing block');
  contents=contents.replace(previous,()=>block);
 }else{
  if((contents.match(/\bsigningConfigs\s*\{/g)||[]).length!==1)throw Error('Review Android signing configurations');
  contents=contents.replace(/(\bsigningConfigs\s*\{)/,(_,anchor)=>anchor+'\n        '+block);
 }
 const buildTypes=contents.indexOf('buildTypes {');if(buildTypes<0)throw Error('Review Android build types');
 const before=contents.slice(0,buildTypes),after=contents.slice(buildTypes);
 if(!/release\s*\{[\s\S]*?signingConfig signingConfigs\.(debug|release)/.test(after))throw Error('Review Android release signing assignment');
 return before+after.replace(/(\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.(debug|release)/,(_,prefix)=>prefix+'signingConfig signingConfigs.release');
}
// EAS-managed credentials keep their normal pipeline. This block is activated
// explicitly by the local release runner, with passwords only in child env.
module.exports=config=>process.env.HIMOTO_ANDROID_LOCAL_SIGNING==='1'?withAppBuildGradle(config,mod=>{mod.modResults.contents=addReleaseSigning(mod.modResults.contents,mod.modResults.language);return mod;}):config;
module.exports.addReleaseSigning=addReleaseSigning;
