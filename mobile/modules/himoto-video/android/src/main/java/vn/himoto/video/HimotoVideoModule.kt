package vn.himoto.video

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** All Transformer access and metadata reads stay on one background Looper. */
@UnstableApi
class HimotoVideoModule : Module() {
  private val worker = HandlerThread("HimotoVideo").apply { start() }
  private val handler = Handler(worker.looper)
  private var active: Job? = null
  @Volatile private var closed = false

  private class Job(val id: String, val output: File, val promise: Promise) {
    var transformer: Transformer? = null
    var durationMs: Long = 0
    var progress: Runnable? = null
    var timeout: Runnable? = null
  }

  override fun definition() = ModuleDefinition {
    Name("HimotoVideo")
    Events("onProgress")

    AsyncFunction("prepare") { id: String, source: String, destination: String, maxSeconds: Int, promise: Promise ->
      if (closed) promise.reject("VIDEO_CLOSED", "Bộ xử lý video đã đóng.", null)
      else handler.post { prepare(id, source, destination, maxSeconds, promise) }
      Unit
    }
    AsyncFunction("cancel") { id: String, promise: Promise ->
      if (closed) promise.resolve()
      else handler.post {
        active?.takeIf { it.id == id }?.let { fail(it, "VIDEO_CANCELLED", "Đã hủy chuẩn bị video.") }
        promise.resolve()
      }
      Unit
    }
    OnDestroy {
      closed = true
      handler.post {
        active?.let { fail(it, "VIDEO_CLOSED", "Bộ xử lý video đã đóng.") }
        worker.quitSafely()
      }
    }
  }

  private fun prepare(id: String, source: String, destination: String, maxSeconds: Int, promise: Promise) {
    if (active != null) {
      promise.reject("VIDEO_BUSY", "Một video khác đang được chuẩn bị. Chờ hoàn tất rồi thử lại.", null)
      return
    }
    var job: Job? = null
    try {
      check(!closed)
      require(maxSeconds == 60 || maxSeconds == 180)
      require(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}").matches(id))
      val context = requireNotNull(appContext.reactContext).applicationContext
      val inputUri = Uri.parse(source)
      require(inputUri.scheme == "file" || inputUri.scheme == "content")
      val directory = File(context.cacheDir, "himoto-video/$id").canonicalFile
      val outputUri = Uri.parse(destination)
      require(outputUri.scheme == "file")
      val output = File(requireNotNull(outputUri.path)).canonicalFile
      require(output.parentFile == directory && output.name == "encoded.mp4" && !output.exists())
      require(directory.isDirectory && directory.parentFile == File(context.cacheDir, "himoto-video").canonicalFile)
      if (inputUri.scheme == "file") require(File(requireNotNull(inputUri.path)).canonicalFile != output)
      val limit = if (maxSeconds == 60) 18L * 1024 * 1024 else 45L * 1024 * 1024
      require(directory.usableSpace >= limit + 8L * 1024 * 1024) { "Không đủ bộ nhớ trống để chuẩn bị video." }
      val task = Job(id, output, promise)
      job = task
      active = task
      val input = metadata(context, inputUri)
      require(input.durationMs in 1..(maxSeconds * 1000L)) {
        if (maxSeconds == 60) "Video hợp đồng tối đa 60 giây." else "Video ca tối đa 3 phút."
      }
      task.durationMs = input.durationMs
      val scale = min(1.0, min(1280.0 / max(input.width, input.height), 720.0 / min(input.width, input.height)))
      val width = max(2, (input.width * scale).toInt() / 2 * 2)
      val height = max(2, (input.height * scale).toInt() / 2 * 2)
      val effects = Effects(emptyList(), listOf(
        Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT),
        FrameDropEffect.createDefaultFrameDropEffect(30f)
      ))
      val encoder = DefaultEncoderFactory.Builder(context)
        .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(1_200_000).build())
        .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(96_000).build())
        .build()
      val transformer = Transformer.Builder(context).setLooper(worker.looper)
        .setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoder)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, result: ExportResult) {
            if (active !== task) return
            try {
              val actual = metadata(context, Uri.fromFile(output))
              require(result.videoMimeType == MimeTypes.VIDEO_H264 && result.videoFrameCount > 0)
              require(result.audioMimeType == null || result.audioMimeType == MimeTypes.AUDIO_AAC)
              require(max(actual.width, actual.height) <= 1280 && min(actual.width, actual.height) <= 720)
              require(actual.durationMs in 1..(maxSeconds * 1000L))
              require(abs(actual.durationMs - task.durationMs) <= max(500L, task.durationMs / 100)) {
                "Video sau xử lý không đủ thời lượng. Chọn lại video gốc."
              }
              require(output.length() in 1..limit) { "Video sau xử lý còn quá lớn. Chọn video ngắn hơn." }
              clear(task)
              task.promise.resolve(mapOf("bytes" to output.length(), "duration" to actual.durationMs / 1000.0,
                "width" to actual.width, "height" to actual.height, "videoMimeType" to result.videoMimeType))
            } catch (error: Exception) {
              fail(task, "VIDEO_INVALID_OUTPUT", error.message ?: "Video sau xử lý chưa hợp lệ.", error)
            }
          }
          override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
            fail(task, "VIDEO_ENCODE_FAILED", "Chưa nén được video trên thiết bị này. Video gốc được giữ nguyên. Chọn lại video hoặc quay đoạn ngắn hơn.", exception)
          }
        }).build()
      task.transformer = transformer
      task.progress = object : Runnable {
        override fun run() {
          if (active !== task) return
          try {
            val progress = ProgressHolder()
            if (transformer.getProgress(progress) == Transformer.PROGRESS_STATE_AVAILABLE)
              sendEvent("onProgress", mapOf("id" to id, "progress" to progress.progress.coerceIn(0, 99)))
            handler.postDelayed(this, 500)
          } catch (error: Exception) {
            fail(task, "VIDEO_PROGRESS_FAILED", "Chưa đọc được tiến trình xử lý video. Chọn lại video gốc.", error)
          } catch (error: LinkageError) {
            fail(task, "VIDEO_PLATFORM_UNAVAILABLE", "Thiết bị chưa xử lý được video này. Video gốc được giữ nguyên.", error)
          }
        }
      }
      task.timeout = Runnable { fail(task, "VIDEO_TIMEOUT", "Chuẩn bị video quá lâu. Video gốc được giữ nguyên. Thử đoạn ngắn hơn.") }
      transformer.start(EditedMediaItem.Builder(MediaItem.fromUri(inputUri)).setEffects(effects).build(), output.path)
      handler.post(requireNotNull(task.progress))
      handler.postDelayed(requireNotNull(task.timeout), if (maxSeconds == 60) 240_000L else 480_000L)
    } catch (error: Exception) {
      if (job != null) fail(job, "VIDEO_PREPARE_FAILED", error.message ?: "Chưa chuẩn bị được video.", error)
      else promise.reject("VIDEO_PREPARE_FAILED", "Chưa mở được video hoặc bộ nhớ tạm. Video gốc được giữ nguyên.", error)
    } catch (error: LinkageError) {
      if (job != null) fail(job, "VIDEO_PLATFORM_UNAVAILABLE", "Thiết bị chưa xử lý được video này. Video gốc được giữ nguyên.", error)
      else promise.reject("VIDEO_PLATFORM_UNAVAILABLE", "Thiết bị chưa xử lý được video này. Video gốc được giữ nguyên.", error)
    }
  }

  private fun clear(job: Job) {
    job.progress?.let { handler.removeCallbacks(it) }
    job.timeout?.let { handler.removeCallbacks(it) }
    active = null
  }

  private fun fail(job: Job, code: String, message: String, error: Throwable? = null) {
    if (active !== job) return
    clear(job)
    // cancel() releases the encoder synchronously; only then may JS remove its directory.
    runCatching { job.transformer?.cancel() }
    runCatching { job.output.delete() }
    job.promise.reject(code, message, error)
  }

  private data class Metadata(val width: Int, val height: Int, val durationMs: Long)

  private fun metadata(context: Context, uri: Uri): Metadata {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, uri)
      var width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      var height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (rotation == 90 || rotation == 270) { val previous = width; width = height; height = previous }
      require(width > 0 && height > 0) { "Không đọc được kích thước video." }
      return Metadata(width, height, retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0)
    } finally {
      retriever.release()
    }
  }
}
