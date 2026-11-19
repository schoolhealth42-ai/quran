package com.noor.quran

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity(), TextToSpeech.OnInitListener {

    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val io = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0B3D2E"))
        setContentView(web)

        // تقديم ملفات الواجهة من origin آمن (https://appassets.androidplatform.net)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            textZoom = 100
        }
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(r.url)
        }
        web.addJavascriptInterface(Bridge(), "Android")
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(Locale("ar"))
            ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String) = js("window.onTts && onTts('start'," + JSONObject.quote(id) + ")")
                override fun onDone(id: String) = js("window.onTts && onTts('done'," + JSONObject.quote(id) + ")")
                @Deprecated("") override fun onError(id: String) = js("window.onTts && onTts('error'," + JSONObject.quote(id) + ")")
            })
        }
    }

    private fun js(code: String) { main.post { web.evaluateJavascript(code, null) } }

    private fun cacheFile(url: String): File {
        val h = MessageDigest.getInstance("MD5").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(File(filesDir, "http").apply { mkdirs() }, h)
    }

    inner class Bridge {
        /** جلب JSON من الإنترنت بدون قيود CORS مع تخزين محلي للاستخدام بلا إنترنت */
        @JavascriptInterface
        fun httpGet(url: String, cb: String) {
            io.execute {
                val f = cacheFile(url)
                var body: String? = null
                var ok = false
                try {
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.connectTimeout = 15000; c.readTimeout = 30000
                    c.setRequestProperty("User-Agent", "NoorQuran/1.0 Android")
                    c.setRequestProperty("Accept", "application/json")
                    if (c.responseCode in 200..299) {
                        body = c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                        f.writeText(body!!); ok = true
                    }
                    c.disconnect()
                } catch (_: Exception) { }
                if (!ok && f.exists()) { body = f.readText(); ok = true }
                val payload = if (ok) JSONObject.quote(body) else "null"
                js("window.__httpCb(" + JSONObject.quote(cb) + "," + payload + ")")
            }
        }

        @JavascriptInterface
        fun clearCache() { File(filesDir, "http").deleteRecursively(); main.post { web.clearCache(true) } }

        @JavascriptInterface fun ttsAvailable(): Boolean = ttsReady

        @JavascriptInterface
        fun speak(text: String, id: String, rate: Float, pitch: Float) {
            tts?.setSpeechRate(rate); tts?.setPitch(pitch)
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
        }

        @JavascriptInterface fun stopSpeak() { tts?.stop() }

        @JavascriptInterface
        fun openTtsSettings() {
            main.post {
                try { startActivity(Intent("com.android.settings.TTS_SETTINGS")) }
                catch (_: Exception) { startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) }
            }
        }

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) = main.post {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        @JavascriptInterface
        fun share(text: String) = main.post {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text)
            }, "مشاركة"))
        }

        @JavascriptInterface
        fun toast(msg: String) = main.post { Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show() }

        @JavascriptInterface
        fun setBars(color: String) = main.post {
            try { val c = Color.parseColor(color); window.statusBarColor = c; window.navigationBarColor = c } catch (_: Exception) {}
        }

        @JavascriptInterface fun exitApp() = main.post { moveTaskToBack(true) }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("window.handleBack ? handleBack() : false") { r ->
            if (r != "true") moveTaskToBack(true)
        }
    }

    // لا نوقف WebView عند الخروج للخلفية حتى يستمر تشغيل التلاوة
    override fun onDestroy() {
        tts?.shutdown(); io.shutdownNow(); web.destroy(); super.onDestroy()
    }
}
