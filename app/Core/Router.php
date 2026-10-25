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

    private function add(string $method, string $pattern, callable $handler): void
    {
        $keys = [];
        $regex = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', static function (array $match) use (&$keys): string {
            $keys[] = $match[1];
            return '(?P<' . $match[1] . '>[0-9]+)';
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
                $params[$key] = (int) ($matches[$key] ?? 0);
            }
            ($candidate['handler'])($params, $request);
            return true;
        }
        return false;
    }
}
