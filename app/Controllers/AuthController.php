<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Core\View;

final class AuthController
{
    public function showLogin(): void
    {
        if (!Config::isInstalled()) {
            Response::redirect(url('install'));
        }
        if (Auth::check()) {
            Response::redirect(url(''));
        }
        View::render('auth/login', [
            'title' => 'Iniciar sesión',
            'old' => ['email' => Session::old('email')],
            'user' => null,
        ], 'auth');
        Session::clearOld();
    }

    public function login(): void
    {
        if (!Config::isInstalled()) {
            Response::redirect(url('install'));
        }
        $request = new Request();
        $email = $request->string('email');
        $password = (string) $request->input('password', '');
        // El formulario de la presentación vuelve a la portada cuando algo
        // falla; el de la página de acceso sigue volviendo a «login».
        $destino = $request->string('desde') === 'inicio' ? url('inicio') : url('login');
        if ($email === '' || $password === '') {
            Session::flash('error', 'Escribe tu correo y contraseña.');
            Session::flashInput(['email' => $email]);
            Response::redirect($destino);
        }
        if (Auth::tooManyAttempts()) {
            Session::flash('error', 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');
            Session::flashInput(['email' => $email]);
            Response::redirect($destino);
        }
        if (!Auth::attempt($email, $password)) {
            Session::flash('error', 'El correo o la contraseña no coinciden.');
            Session::flashInput(['email' => $email]);
            Response::redirect($destino);
        }
        Session::clearOld();
        Session::flash('success', 'Bienvenido de nuevo.');
        Response::redirect(url(''));
    }

    public function logout(): void
    {
        Auth::logout();
        Response::redirect(url('login'));
    }
}
