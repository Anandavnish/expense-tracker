const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to:
 * 1. Declare Google Play Services OCR dependency in AndroidManifest.xml so Google Play Services
 *    pre-downloads and manages the OCR model on the device dynamically.
 * 2. Substitute bundled MLKit text-recognition (16.0.1) with Google Play Services thin client
 *    (play-services-mlkit-text-recognition:19.0.1) in build.gradle, cutting ~30MB+ of model
 *    binaries per architecture and drastically reducing standalone APK size.
 */

const withOcrMetaData = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.application || !manifest.application[0]) {
      return config;
    }

    const mainApplication = manifest.application[0];
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const hasOcrMeta = mainApplication['meta-data'].some(
      (item) => item.$ && item.$['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES'
    );

    if (!hasOcrMeta) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.mlkit.vision.DEPENDENCIES',
          'android:value': 'ocr',
        },
      });
    }

    return config;
  });
};

const withPlayServicesOcrGradle = (config) => {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const substitutionBlock = `
// Antigravity: Substitute bundled MLKit OCR with Google Play Services dynamic thin client
// Drastically shrinks standalone APK size from ~145MB down to ~25MB
configurations.all {
    resolutionStrategy {
        dependencySubstitution {
            substitute module('com.google.mlkit:text-recognition') using module('com.google.android.gms:play-services-mlkit-text-recognition:19.0.1')
        }
    }
}
`;

    if (!contents.includes('play-services-mlkit-text-recognition')) {
      config.modResults.contents = contents + substitutionBlock;
    }

    return config;
  });
};

module.exports = function withPlayServicesOcr(config) {
  return withPlayServicesOcrGradle(withOcrMetaData(config));
};
