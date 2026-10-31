<?php
declare(strict_types=1);

/**
 * Lanzador de la distribución de escritorio de Normia Planos CAD.
 *
 * Levanta el servidor integrado de PHP escuchando **solo en 127.0.0.1** (nunca
 * en la red local), guarda los datos en la carpeta del usuario y abre el
 * navegador. No escribe dentro de la carpeta del programa, así que una
 * actualización no borra planos.
 *
 * Uso:
 *   php launcher.php                 # arranca y abre el navegador
 *   php launcher.php --no-browser    # útil en pruebas
 *   php launcher.php --port=9000     # puerto fijo
 *   php launcher.php --data=/ruta    # carpeta de datos alternativa
 *   php launcher.php --stop          # detiene la instancia en marcha
 *   php launcher.php --status        # dice si está corriendo
 *
 * El archivo se puede incluir desde las pruebas: la ejecución solo ocurre si se
 * invoca como programa (constante NORMA_LAUNCHER_LIB ausente).
 */

/** Carpeta de datos por sistema, respetando NORMA_DATA_PATH si viene del entorno. */
function normaLDefaultDataDir(): string
{
    $fromEnv = getenv('NORMA_DATA_PATH');
    if (is_string($fromEnv) && trim($fromEnv) !== '') {
        return rtrim(trim($fromEnv), '/\\');
    }
    $home = getenv('HOME');
    if (PHP_OS_FAMILY === 'Windows') {
        $local = getenv('LOCALAPPDATA');
        $base = is_string($local) && $local !== '' ? $local : (is_string($home) ? $home . '\\AppData\\Local' : '');
        return $base !== '' ? rtrim($base, '/\\') . '\\Normia' : __DIR__;
    }
    if (is_string($home) && $home !== '') {
        if (PHP_OS_FAMILY === 'Darwin') {
            return rtrim($home, '/') . '/Library/Application Support/Normia';
        }
        $xdg = getenv('XDG_DATA_HOME');
        return is_string($xdg) && $xdg !== '' ? rtrim($xdg, '/') . '/normia' : rtrim($home, '/') . '/.local/share/normia';
    }
    return __DIR__;
}

/** Prepara config, sesiones y registros; devuelve los que no se pudieron crear. */
function normaLPrepareDataDir(string $dataDir): array
{
    $failed = [];
    foreach (['config', 'storage', 'storage/sessions', 'storage/logs', 'storage/cache'] as $relative) {
        $directory = rtrim($dataDir, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if (is_dir($directory)) {
            continue;
        }
        if (!@mkdir($directory, 0770, true) && !is_dir($directory)) {
            $failed[] = $directory;
        }
    }
    return $failed;
}

/** Archivo con el estado de la instancia en marcha. */
function normaLStateFile(string $dataDir): string
{
    return rtrim($dataDir, '/\\') . '/storage/normia-desktop.json';
}

/** Puerto libre en la interfaz local. Se pide al sistema para no chocar. */
function normaLFreePort(int $from = 8790, int $until = 8810): int
{
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    if ($socket !== false) {
        $name = stream_socket_get_name($socket, false);
        fclose($socket);
        if (is_string($name) && str_contains($name, ':')) {
            $port = (int) substr($name, strrpos($name, ':') + 1);
            if ($port > 1024) {
                return $port;
            }
        }
    }
    // Respaldo: si el sistema no ofrece un puerto efímero (algunos servidores
    // restringidos), se busca uno libre en el rango de la aplicación.
    for ($port = $from; $port <= $until; $port++) {
        $probe = @stream_socket_server('tcp://127.0.0.1:' . $port, $errno, $error);
        if ($probe !== false) {
            fclose($probe);
            return $port;
        }
    }
    return 0;
}

/** URL de la aplicación para un puerto dado. */
function normaLAppUrl(int $port, string $route = ''): string
{
    $base = 'http://127.0.0.1:' . $port . '/index.php';
    return $route === '' ? $base . '?r=' : $base . '?r=' . rawurlencode($route);
}

/** ¿Responde la aplicación en ese puerto? (chequeo de vida) */
function normaLIsAlive(int $port, float $timeout = 0.4): bool
{
    $context = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true]]);
    $response = @file_get_contents(normaLAppUrl($port), false, $context);
    return $response !== false;
}

/** Estado guardado de la instancia, o null si no hay archivo válido. */
function normaLReadState(string $dataDir): ?array
{
    $file = normaLStateFile($dataDir);
    if (!is_file($file)) {
        return null;
    }
    $raw = @file_get_contents($file);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || !isset($data['port'], $data['pid'])) {
        return null;
    }
    return [
        'pid' => (int) $data['pid'],
        'child' => (int) ($data['child'] ?? 0),
        'port' => (int) $data['port'],
        'startedAt' => (string) ($data['started_at'] ?? ''),
        'url' => (string) ($data['url'] ?? ''),
    ];
}

function normaLWriteState(string $dataDir, array $state): void
{
    @file_put_contents(normaLStateFile($dataDir), json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function normaLClearState(string $dataDir): void
{
    $file = normaLStateFile($dataDir);
    if (is_file($file)) {
        @unlink($file);
    }
}

/** ¿El proceso sigue vivo? */
function normaLProcessAlive(int $pid): bool
{
    if ($pid <= 0) {
        return false;
    }
    if (PHP_OS_FAMILY === 'Windows') {
        $output = @shell_exec('tasklist /FI "PID eq ' . $pid . '" /NH 2>NUL');
        return is_string($output) && str_contains($output, (string) $pid);
    }
    if (function_exists('posix_kill')) {
        return @posix_kill($pid, 0);
    }
    return is_dir('/proc/' . $pid);
}

/** Abre el navegador del sistema. No falla si no hay uno disponible. */
function normaLOpenBrowser(string $url): void
{
    $commands = match (PHP_OS_FAMILY) {
        'Darwin' => ['open', $url],
        'Windows' => ['cmd', '/c', 'start', '', $url],
        default => ['xdg-open', $url],
    };
    if (PHP_OS_FAMILY === 'Windows') {
        @pclose(@popen(implode(' ', array_map(static fn (string $part): string => str_contains($part, ' ') ? '"' . $part . '"' : $part, $commands)) . ' > NUL 2>&1', 'r'));
        return;
    }
    $process = @proc_open($commands, [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    if (is_resource($process)) {
        @proc_close($process);
    }
}

/** Interfaz pedida por la línea de órdenes. */
function normaLParseArgs(array $argv): array
{
    $options = ['no-browser' => false, 'stop' => false, 'status' => false, 'port' => 0, 'data' => ''];
    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--no-browser') {
            $options['no-browser'] = true;
        } elseif ($argument === '--stop') {
            $options['stop'] = true;
        } elseif ($argument === '--status') {
            $options['status'] = true;
        } elseif (str_starts_with($argument, '--port=')) {
            $options['port'] = (int) substr($argument, 7);
        } elseif (str_starts_with($argument, '--data=')) {
            $options['data'] = substr($argument, 7);
        }
    }
    return $options;
}

/** Termina una instancia a partir de su estado guardado. */
function normaLStop(string $dataDir): int
{
    $state = normaLReadState($dataDir);
    if ($state === null) {
        echo "Normia no está en marcha.\n";
        return 0;
    }
    $targets = array_values(array_filter([$state['child'], $state['pid']], static fn (int $pid): bool => $pid > 0));
    foreach ($targets as $pid) {
        if (PHP_OS_FAMILY === 'Windows') {
            @shell_exec('taskkill /PID ' . $pid . ' /T /F > NUL 2>&1');
        } elseif (function_exists('posix_kill')) {
            @posix_kill($pid, 15);
        }
    }
    normaLWaitForExit($state);
    normaLClearState($dataDir);
    echo "Normia se detuvo.\n";
    return 0;
}

/** Espera a que la instancia termine (máximo 3 s). */
function normaLWaitForExit(array $state): void
{
    for ($attempt = 0; $attempt < 30; $attempt += 1) {
        if (normaLProcessAlive((int) $state['child']) === false && normaLProcessAlive((int) $state['pid']) === false) {
            return;
        }
        usleep(100000);
    }
}

/** Arranca el servidor y devuelve el proceso, o null con el motivo. */
function normaLStartServer(string $root, int $port, string $dataDir): ?array
{
    $command = [
        PHP_BINARY,
        '-d', 'variables_order=EGPCS',
        '-d', 'display_errors=0',
        '-d', 'log_errors=1',
        '-d', 'error_log=' . rtrim($dataDir, '/\\') . '/storage/logs/php-desktop.log',
        '-S', '127.0.0.1:' . $port,
        '-t', $root,
        $root . '/tools/desktop/router.php',
    ];
    $descriptors = [
        0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'],
        1 => ['file', rtrim($dataDir, '/\\') . '/storage/logs/servidor.log', 'a'],
        2 => ['file', rtrim($dataDir, '/\\') . '/storage/logs/servidor.log', 'a'],
    ];
    $environment = ['NORMA_DATA_PATH' => $dataDir] + (function_exists('getenv') ? getenv() : []);
    $process = @proc_open($command, $descriptors, $pipes, $root, $environment);
    if (!is_resource($process)) {
        return null;
    }
    $status = proc_get_status($process);
    return ['process' => $process, 'pid' => (int) ($status['pid'] ?? 0)];
}

/** Cuerpo principal del lanzador. Devuelve el código de salida. */
function normaLMain(array $argv, ?callable $openBrowser = null): int
{
    $root = dirname(__DIR__, 2);
    $options = normaLParseArgs($argv);
    $dataDir = $options['data'] !== '' ? rtrim($options['data'], '/\\') : normaLDefaultDataDir();

    if ($options['stop']) {
        return normaLStop($dataDir);
    }

    $failed = normaLPrepareDataDir($dataDir);
    if ($failed !== []) {
        fwrite(STDERR, "No se pudo preparar la carpeta de datos:\n  " . implode("\n  ", $failed) . "\n");
        return 1;
    }

    $state = normaLReadState($dataDir);
    if ($state !== null && normaLIsAlive($state['port'])) {
        if ($options['status']) {
            echo "Normia está en marcha en {$state['url']}\n";
            return 0;
        }
        echo "Normia ya estaba abierto en {$state['url']}\n";
        if (!$options['no-browser']) {
            $opener = $openBrowser ?? 'normaLOpenBrowser';
            $opener($state['url']);
        }
        return 0;
    }

    if ($options['status']) {
        echo "Normia no está en marcha.\n";
        return 1;
    }

    $port = $options['port'] > 0 ? $options['port'] : normaLFreePort();
    if ($port <= 0) {
        fwrite(STDERR, "No se encontró un puerto libre para el servidor local.\n");
        return 1;
    }

    $started = normaLStartServer($root, $port, $dataDir);
    if ($started === null) {
        fwrite(STDERR, "No se pudo iniciar el servidor de PHP.\n");
        return 1;
    }

    $ready = false;
    for ($attempt = 0; $attempt < 100; $attempt += 1) {
        if (normaLIsAlive($port, 0.3)) {
            $ready = true;
            break;
        }
        usleep(120000);
    }
    if (!$ready) {
        proc_terminate($started['process']);
        fwrite(STDERR, "El servidor no respondió en el puerto {$port}.\n");
        return 1;
    }

    $config = rtrim($dataDir, '/\\') . '/config/config.php';
    $route = is_file($config) ? '' : 'install';
    $url = normaLAppUrl($port, $route);
    normaLWriteState($dataDir, [
        'pid' => getmypid(),
        'child' => $started['pid'],
        'port' => $port,
        'started_at' => gmdate('c'),
        'url' => $url,
    ]);

    echo "Normia Planos CAD · servidor local en 127.0.0.1:{$port}\n";
    echo is_file($config) ? "Abre: {$url}\n" : "Primera ejecución: completa la instalación en el navegador.\n";
    echo "Datos: {$dataDir}\n";
    echo "Cierra esta ventana o pulsa Ctrl+C para detenerlo.\n";

    if (!$options['no-browser']) {
        ($openBrowser ?? 'normaLOpenBrowser')($url);
    }

    // Si el sistema cierra la aplicación (Dock, Ctrl+C, cierre de sesión), el
    // servidor tiene que morir con ella: nadie quiere un proceso huérfano
    // escuchando en un puerto que ya no usa.
    if (function_exists('pcntl_signal') && function_exists('pcntl_async_signals')) {
        pcntl_async_signals(true);
        $shutdown = static function () use ($started, $dataDir): void {
            if (is_resource($started['process'])) {
                @proc_terminate($started['process']);
            }
            normaLClearState($dataDir);
            exit(0);
        };
        foreach ([SIGINT, SIGTERM, SIGHUP] as $signal) {
            pcntl_signal($signal, $shutdown);
        }
    }

    // Se espera al servidor: si el usuario cierra la ventana, muere con ella.
    proc_close($started['process']);
    normaLClearState($dataDir);
    return 0;
}

if (!defined('NORMA_LAUNCHER_LIB') && PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    exit(normaLMain($argv));
}
