<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\ValidationException;
use App\Models\User;

final class AccountController extends BaseController
{
    public function show(): void
    {
        $this->render('account/password', [
            'title' => 'Seguridad de la cuenta',
            'errors' => [],
        ]);
    }

    public function update(): void
    {
        $request = new Request();
        $user = $this->user();
        $current = (string) $request->input('current_password', '');
        $password = (string) $request->input('password', '');
        $confirm = (string) $request->input('password_confirm', '');
        $errors = [];
        if (!User::verifyPassword((int) $user['id'], $current)) {
            $errors['current_password'] = 'La contraseña actual no coincide.';
        }
        if ($password !== $confirm) {
            $errors['password_confirm'] = 'La confirmación no coincide.';
        }
        if ($errors === []) {
            try {
                User::updatePassword((int) $user['id'], $password);
                flash_success('Contraseña actualizada.');
                Response::redirect(url('account/password'));
            } catch (ValidationException $exception) {
                $errors = $exception->errors();
            }
        }
        $this->render('account/password', [
            'title' => 'Seguridad de la cuenta',
            'errors' => $errors,
        ]);
    }
}
