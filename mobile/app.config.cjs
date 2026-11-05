// Native Firebase configuration is supplied by the owner at build time.
// No dotenv is read here; Expo commands must use EXPO_NO_DOTENV=1.
module.exports = ({config}) => {
  const googleServicesFile = process.env.HIMOTO_ANDROID_GOOGLE_SERVICES_FILE;
  return {...config,
    android: {...config.android, ...(googleServicesFile ? {googleServicesFile} : {})},
    extra: {...config.extra, androidPushConfigured: !!googleServicesFile},
  };
};
