<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\ValidationException;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;

/**
 * Empresas y personas.
 *
 * Una empresa agrupa los planos y las personas que los consultan o editan.
 * El propietario y los administradores dan acceso; una persona nueva recibe
 * su cuenta y la contraseña temporal la entrega quien la invita (la
 * aplicación no envía correo).
 */
final class OrganizationController extends BaseController
{
    /** Alcance de cada rol para administrar a otras personas. */
    private const RANK = ['viewer' => 0, 'editor' => 1, 'admin' => 2, 'owner' => 3];

    public function index(): void
    {
        $user = $this->user();
        $organizations = Organization::forUser((int) $user['id']);
        $this->render('organizations/index', [
            'title' => 'Empresas',
            'organizations' => $organizations,
            'writable' => array_map(static fn (array $row): int => (int) $row['id'], Organization::writableForUser((int) $user['id'])),
        ]);
    }

    public function create(): void
    {
        $this->render('organizations/form', [
            'title' => 'Nueva empresa',
            'organization' => null,
            'errors' => [],
            'old' => [],
        ]);
    }

    public function store(): void
    {
        $request = new Request();
        $user = $this->user();
        try {
            $id = Organization::create((int) $user['id'], $request->all());
            flash_success('Empresa creada. Ya puedes añadir personas y proyectos.');
            Response::redirect(url('empresas/' . $id));
        } catch (ValidationException $exception) {
            $this->render('organizations/form', [
                'title' => 'Nueva empresa',
                'organization' => null,
                'errors' => $exception->errors(),
                'old' => $request->all(),
            ]);
        }
    }

    public function show(int $organizationId): void
    {
        $organization = $this->organization($organizationId);
        $user = $this->user();
        $role = (string) ($organization['role'] ?? 'viewer');
        $this->render('organizations/show', [
            'title' => $organization['name'],
            'organization' => $organization,
            'members' => Organization::members($organizationId),
            'stats' => Organization::stats($organizationId),
            'roles' => Membership::ROLES,
            'labels' => Membership::LABELS,
            'descriptions' => Membership::DESCRIPTIONS,
            'canManage' => Membership::can($role, 'manage'),
            'canOwn' => $role === 'owner',
            'selfId' => (int) $user['id'],
            'assignable' => $this->assignableRoles($role),
            'errors' => [],
            'old' => [],
        ]);
    }

    public function update(int $organizationId): void
    {
        $request = new Request();
        $organization = $this->organization($organizationId);
        if (!Membership::can($organization['role'] ?? null, 'manage')) {
            $this->deny($organizationId, 'Solo un administrador o el propietario puede cambiar los datos de la empresa.');
        }
        try {
            Organization::update($organizationId, $request->all());
            flash_success('Datos de la empresa actualizados.');
            Response::redirect(url('empresas/' . $organizationId));
        } catch (ValidationException $exception) {
            $user = $this->user();
            $role = (string) ($organization['role'] ?? 'viewer');
            $this->render('organizations/show', [
                'title' => $organization['name'],
                'organization' => array_merge($organization, $request->all()),
                'members' => Organization::members($organizationId),
                'stats' => Organization::stats($organizationId),
                'roles' => Membership::ROLES,
                'labels' => Membership::LABELS,
                'descriptions' => Membership::DESCRIPTIONS,
                'canManage' => Membership::can($role, 'manage'),
                'canOwn' => $role === 'owner',
                'selfId' => (int) $user['id'],
                'assignable' => $this->assignableRoles($role),
                'errors' => $exception->errors(),
                'old' => $request->all(),
            ]);
        }
    }

    /** Da acceso a una cuenta existente o crea la cuenta y la vincula. */
    public function addMember(int $organizationId): void
    {
        $request = new Request();
        $actor = $this->user();
        $organization = $this->organization($organizationId);
        if (!Membership::can($organization['role'] ?? null, 'manage')) {
            $this->deny($organizationId, 'Tu rol no permite añadir personas a esta empresa.');
        }

        $email = trim((string) $request->input('email', ''));
        $name = trim((string) $request->input('name', ''));
        $password = (string) $request->input('password', '');
        $role = Membership::normalizeRole((string) $request->input('role', 'editor'));
        if (!in_array($role, $this->assignableRoles((string) $organization['role']), true)) {
            flash_error('No puedes asignar ese rol.');
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            flash_error('Escribe un correo válido para la persona.');
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }

        $existing = User::findByEmail($email);
        try {
            if ($existing !== null) {
                $userId = (int) $existing['id'];
                if (Membership::roleFor($organizationId, $userId) !== null) {
                    flash_error('Esa cuenta ya pertenece a la empresa.');
                    Response::redirect(url('empresas/' . $organizationId . '#personas'));
                }
                Membership::add($organizationId, $userId, $role);
                flash_success('Acceso concedido a ' . $email . ' como ' . Membership::label($role) . '.');
            } else {
                $userId = User::create($name, $email, $password, false);
                Membership::add($organizationId, $userId, $role);
                flash_success('Cuenta creada para ' . $email . '. Entrega la contraseña temporal y pide cambiarla al entrar.');
            }
        } catch (ValidationException $exception) {
            flash_error(implode(' ', $exception->errors()));
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }
        Response::redirect(url('empresas/' . $organizationId . '#personas'));
    }

    public function updateRole(int $organizationId, int $memberId): void
    {
        $request = new Request();
        $organization = $this->organization($organizationId);
        if (!Membership::can($organization['role'] ?? null, 'manage')) {
            $this->deny($organizationId, 'Tu rol no permite cambiar roles en esta empresa.');
        }
        $target = Membership::roleFor($organizationId, $memberId);
        if ($target === null) {
            flash_error('Esa persona no pertenece a la empresa.');
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }
        $isSelf = $memberId === (int) $this->user()['id'];
        if (!$this->canManageMember((string) $organization['role'], $target, $isSelf)) {
            $this->deny($organizationId, 'No puedes administrar a alguien con un rol igual o superior al tuyo.');
        }
        $role = Membership::normalizeRole((string) $request->input('role', 'viewer'));
        if (!in_array($role, $this->assignableRoles((string) $organization['role']), true)) {
            flash_error('No puedes asignar ese rol.');
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }
        try {
            Membership::setRole($organizationId, $memberId, $role);
            flash_success('Rol actualizado a ' . Membership::label($role) . '.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('empresas/' . $organizationId . '#personas'));
    }

    public function removeMember(int $organizationId, int $memberId): void
    {
        $organization = $this->organization($organizationId);
        if (!Membership::can($organization['role'] ?? null, 'manage')) {
            $this->deny($organizationId, 'Tu rol no permite quitar personas de esta empresa.');
        }
        $target = Membership::roleFor($organizationId, $memberId);
        if ($target === null) {
            flash_error('Esa persona no pertenece a la empresa.');
            Response::redirect(url('empresas/' . $organizationId . '#personas'));
        }
        if (!$this->canManageMember((string) $organization['role'], $target, $memberId === (int) $this->user()['id'])) {
            $this->deny($organizationId, 'No puedes administrar a alguien con un rol igual o superior al tuyo.');
        }
        try {
            Membership::remove($organizationId, $memberId);
            flash_success('La persona ya no tiene acceso a la empresa. Sus planos y versiones se conservan.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('empresas/' . $organizationId . '#personas'));
    }

    public function destroy(int $organizationId): void
    {
        $organization = $this->organization($organizationId);
        if (($organization['role'] ?? '') !== 'owner') {
            flash_error('Solo el propietario puede eliminar la empresa.');
            Response::redirect(url('empresas/' . $organizationId));
        }
        $request = new Request();
        if (trim((string) $request->input('confirm', '')) !== (string) $organization['name']) {
            flash_error('Para eliminar la empresa escribe su nombre exactamente como aparece.');
            Response::redirect(url('empresas/' . $organizationId . '#eliminar'));
        }
        Organization::delete($organizationId);
        flash_success('Empresa eliminada con sus proyectos, pisos y versiones.');
        Response::redirect(url('empresas'));
    }

    /* ------------------------------- ayudas ------------------------------- */

    /**
     * Detiene la acción con un aviso y vuelve a la ficha de la empresa.
     *
     * Los rechazos por rol no son errores del servidor: la persona sigue
     * viendo la empresa, así que se le explica en la misma página.
     */
    private function deny(int $organizationId, string $message): void
    {
        flash_error($message);
        Response::redirect(url('empresas/' . $organizationId . '#personas'));
    }


    /** Roles que el actor puede asignar: nunca por encima del suyo. */
    private function assignableRoles(string $actorRole): array
    {
        $ceiling = self::RANK[$actorRole] ?? 0;
        return array_values(array_filter(
            Membership::ROLES,
            static fn (string $role): bool => (self::RANK[$role] ?? 0) <= $ceiling
        ));
    }

    /**
     * Un administrador solo administra roles inferiores al suyo; el propietario
     * administra a todos (el modelo impide quedarse sin propietario).
     */
    private function canManageMember(string $actorRole, string $targetRole, bool $isSelf = false): bool
    {
        $actor = self::RANK[$actorRole] ?? 0;
        $target = self::RANK[$targetRole] ?? 0;
        // El propietario puede bajar su propio rol para dejar la empresa a otra
        // persona; el modelo impide que se quede sin propietario.
        if ($isSelf && $actorRole === 'owner') {
            return true;
        }
        return $actor >= 2 && $actor > $target;
    }
}
