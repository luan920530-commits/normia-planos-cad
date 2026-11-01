<?php
declare(strict_types=1);

namespace App\Core;

final class Router
{
    /** @var array<int,array{method:string,pattern:string,regex:string,keys:array<int,string>,handler:callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    /**
     * Parámetros de ruta y su forma. Por defecto son identificadores numéricos;
     * se puede pedir otro tipo con dos puntos: `{id:slug}`, `{tipo:word}`.
     *
     * - `slug`: identificadores con guiones (`acme-senalizacion`).
     * - `word`: palabras simples (`senalizacion`, `cad`).
     * - `token`: el token hexadecimal de 32 caracteres del modo brigadista.
     */
    private const PARAM_TYPES = [
        'slug' => '[a-z][a-z0-9-]{2,31}',
        'word' => '[a-z][a-z0-9_-]{1,31}',
        'token' => '[a-f0-9]{32}',
    ];

    private function add(string $method, string $pattern, callable $handler): void
    {
        $keys = [];
        $regex = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-z]+))?\}/', static function (array $match) use (&$keys): string {
            // `{token}` conserva su significado histórico (token hexadecimal del
            // modo brigadista); el resto de parámetros es numérico si no se dice.
            $type = (string) ($match[2] ?? '');
            if ($type === '') {
                $type = $match[1] === 'token' ? 'token' : '';
            }
            $keys[] = ['name' => $match[1], 'type' => $type];
            $value = self::PARAM_TYPES[$type] ?? '[0-9]+';
            return '(?P<' . $match[1] . '>' . $value . ')';
        }, $pattern) ?? '';
        $this->routes[] = [
            'method' => $method,
            'pattern' => $pattern,
            'regex' => '#^' . $regex . '$#D',
            'keys' => $keys,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): bool
    {
        $route = $request->route();
        foreach ($this->routes as $candidate) {
            if ($candidate['method'] !== $request->method()) {
                continue;
            }
            if (preg_match($candidate['regex'], $route, $matches) !== 1) {
                continue;
            }
            $params = [];
            foreach ($candidate['keys'] as $key) {
                $value = (string) ($matches[$key['name']] ?? '');
                $params[$key['name']] = $key['type'] === '' ? (int) $value : $value;
            }
            ($candidate['handler'])($params, $request);
            return true;
        }
        return false;
    }
}
