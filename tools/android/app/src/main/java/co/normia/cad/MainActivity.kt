package co.normia.cad

import android.content.ContentValues
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

/**
 * Único Activity de la aplicación.
 *
 * Carga la pantalla desde los activos con `WebViewAssetLoader`, que expone la
 * carpeta `assets/` del APK como `https://appassets.androidplatform.net/assets/`.
 * Ese origen es seguro: permite almacenamiento local y el intérprete de PHP en
 * WebAssembly. Todo el resto lo resuelve JavaScript (`shell.js`).
 *
 * El `build.mjs` deja la aplicación en la raíz de `assets/`, y el cargador solo
 * resuelve rutas que estén **debajo** del prefijo registrado: por eso el prefijo
 * es `/assets/` y la pantalla se abre en `/assets/index.html`. Con el prefijo en
 * `/` (o pidiendo `/index.html`) la petición no encuentra el archivo y el WebView
 * muestra «net::ERR_INVALID_RESPONSE»; y si la aplicación quedara en
 * `assets/www/`, el HTML cargaría sin estilos ni scripts porque sus rutas
 * `/assets/…` apuntarían a `assets/assets/…`.
 *
 * El código nativo solo hace tres cosas: elegir un archivo para importar, guardar
 * descargas en la carpeta pública de descargas e imprimir la hoja del plano.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<android.net.Uri>>? = null

    private val chooseFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val uris = result.data?.let { data ->
            data.clipData?.let { clip ->
                Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
            } ?: data.data?.let { arrayOf(it) }
        }
        callback.onReceiveValue(uris)
    }

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler(ASSETS_PREFIX, WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

            addJavascriptInterface(Host(), "NormiaHost")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Nada sale del equipo: si un enlace apunta fuera, no se abre.
                    return request.url.host != HOST
                }

                /**
                 * Si la pantalla inicial no llega a cargarse, el WebView enseña
                 * una página del sistema («net::ERR_INVALID_RESPONSE») que no
                 * dice nada útil. Aquí se reemplaza por un aviso en español con
                 * el código, la dirección que falló y un enlace para reintentar.
                 */
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (!request.isForMainFrame) return
                    Log.e("Normia", "No cargó ${request.url}: ${error.errorCode} ${error.description}")
                    view.loadDataWithBaseURL(
                        "https://$HOST/",
                        errorPage(error.errorCode, error.description?.toString().orEmpty()),
                        "text/html",
                        "utf-8",
                        null
                    )
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<android.net.Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "*/*"
                    }
                    return try {
                        chooseFile.launch(intent)
                        true
                    } catch (error: Exception) {
                        fileCallback = null
                        false
                    }
                }
            }

            loadUrl(ENTRY)
        }

        setContentView(webView)
    }

    /** El botón «atrás» del sistema lo resuelve la pantalla; si no puede, cierra. */
    @Deprecated("El sistema llama a este método en Android 13 y anteriores")
    override fun onBackPressed() {
        webView.evaluateJavascript("window.__normiaBack ? window.__normiaBack() : 'salir'") { result ->
            if (result == null || result.contains("salir")) {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onPause() {
        webView.evaluateJavascript("window.__normiaPersist && window.__normiaPersist()", null)
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** Aviso propio cuando la pantalla no carga (reemplaza el error del sistema). */
    private fun errorPage(code: Int, description: String): String = """
        <!doctype html>
        <html lang="es"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Normia Planos CAD</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
                 background: #0d1728; color: #dbe3ef; font: 16px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
          main { max-width: 34rem; }
          h1 { margin: 0 0 12px; font-size: 1.25rem; color: #f2f7ff; }
          p { margin: 0 0 10px; color: #9fb2cd; }
          code { background: rgba(255, 255, 255, .08); padding: 2px 6px; border-radius: 6px; color: #e6eefc; word-break: break-all; }
          a { display: inline-block; margin: 8px 0 14px; padding: 12px 18px; border-radius: 12px;
              background: #0a6cf5; color: #fff; font-weight: 600; text-decoration: none; }
        </style></head>
        <body><main>
          <h1>No se pudo abrir el editor</h1>
          <p>La aplicación no encontró su pantalla inicial dentro del paquete instalado
             (<code>${escapeHtml(description)}</code> · código ${code}).</p>
          <p>Puede ocurrir si el APK se copió a medias o si se instaló encima de otra versión.
             Vuelve a instalar el APK completo; si sigue igual, guarda este texto y repórtalo.</p>
          <a href="${ENTRY}">Reintentar</a>
          <p><code>${ENTRY}</code></p>
        </main></body></html>
    """.trimIndent()

    private fun escapeHtml(text: String): String = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")

    /** Puente que usa `shell.js`. */
    inner class Host {

        @JavascriptInterface
        fun log(message: String) {
            Log.i("Normia", message)
        }

        /** Guarda un archivo en Descargas y avisa al usuario. */
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String): Boolean {
            return try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val safeName = name.replace(Regex("[\\\\/:*?\"<>|]"), "-").ifBlank { "normia" }
                val destination = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri == null) {
                        null
                    } else {
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                        values.clear()
                        values.put(MediaStore.Downloads.IS_PENDING, 0)
                        contentResolver.update(uri, values, null, null)
                        "Descargas"
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val folder = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    folder.mkdirs()
                    val file = File(folder, safeName)
                    FileOutputStream(file).use { it.write(bytes) }
                    "Descargas"
                }
                toast(if (destination == null) "No se pudo guardar $safeName" else "Guardado en $destination: $safeName")
                destination != null
            } catch (error: Exception) {
                Log.e("Normia", "No se pudo guardar el archivo", error)
                toast("No se pudo guardar $name")
                false
            }
        }

        /** Abre el diálogo de impresión de Android con la hoja del plano. */
        @JavascriptInterface
        fun printHtml(html: String, jobName: String) {
            Handler(Looper.getMainLooper()).post {
                val printer = WebView(this@MainActivity).apply {
                    settings.javaScriptEnabled = false
                    loadDataWithBaseURL("https://$HOST/", html, "text/html", "utf-8", null)
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView, url: String) {
                            val manager = getSystemService(PRINT_SERVICE) as PrintManager
                            val adapter = view.createPrintDocumentAdapter(jobName)
                            manager.print(jobName, adapter, PrintAttributes.Builder().build())
                        }
                    }
                }
                printer.tag = "normia-print"
            }
        }

        @JavascriptInterface
        fun close() {
            Handler(Looper.getMainLooper()).post { finish() }
        }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME

        private fun toast(message: String) {
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            }
        }
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"

        /**
         * Prefijo que el cargador mapea a `app/src/main/assets/`. Tiene que ser
         * una carpeta real: la raíz (`/`) no lo es, y pedir un archivo que no
         * está debajo del prefijo devuelve una respuesta inválida.
         */
        private const val ASSETS_PREFIX = "/assets/"

        /**
         * Pantalla de arranque. `build.mjs` copia la aplicación a la **raíz** de
         * `assets/`, así que la ruta es `/assets/index.html`, y las páginas PHP
         * piden sus recursos en `/assets/…`, que es donde están. `ENTRY` se usa
         * también en el aviso de error para ofrecer «Reintentar».
         */
        private val ENTRY = "https://$HOST${ASSETS_PREFIX}index.html"
    }
}
