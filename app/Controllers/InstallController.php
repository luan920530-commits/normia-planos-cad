<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Request;
use App\Core\Session;
use App\Core\ValidationException;
use App\Core\View;
use App\Services\Installer;

final class InstallController
{
    public function show(): void
    {
        if (Config::isInstalled()) {
            \App\Core\Response::redirect(url('login'));
        }
        $installer = new Installer();
        $requirements = $installer->requirements();
        $ready = $installer->canInstall();
        View::render('install/index', [
            'title' => 'Instalar Normia Planos CAD',
            'requirements' => $requirements,
            'ready' => $ready,
            'demoBuild' => Config::isDemoBuild(),
            'errors' => [],
            'old' => [
                'name' => Session::old('name'),
                'email' => Session::old('email'),
                'demo' => Config::isDemoBuild() ? '1' : '',
            ],
            'user' => null,
        ], 'auth');
        Session::clearOld();
    }

    public function install(): void
    {
        if (Config::isInstalled()) {
            \App\Core\Response::redirect(url('login'));
        }
        $request = new Request();
        $installer = new Installer();
        try {
            $result = $installer->install($request->all());
            Session::clearOld();
            Session::flash('success', 'Instalación completada. Inicia sesión con ' . $result['email'] . '.');
            \App\Core\Response::redirect(url('login'));
        } catch (ValidationException $exception) {
            Session::flashInput($request->all());
            $errors = $exception->errors();
            View::render('install/index', [
                'title' => 'Instalar Normia Planos CAD',
                'requirements' => $installer->requirements(),
                'ready' => $installer->canInstall(),
                'demoBuild' => Config::isDemoBuild(),
                'errors' => $errors,
                'old' => [
                    'name' => $request->string('name'),
                    'email' => $request->string('email'),
                    'demo' => $request->boolean('demo') ? '1' : '',
                ],
                'user' => null,
            ], 'auth');
        }
    }
}
