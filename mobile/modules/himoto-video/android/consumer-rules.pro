# Media3/R8 horizontal merging can resolve LogSessionId on API <31.
# Keep only the transformer factories/listener which cross that API boundary.
# https://github.com/androidx/media/issues/2535
-keep class androidx.media3.transformer.DefaultAssetLoaderFactory { *; }
-keep class androidx.media3.transformer.ExoPlayerAssetLoader$Factory { *; }
-keep class androidx.media3.transformer.TransformerInternal$SequenceAssetLoaderListener { *; }
