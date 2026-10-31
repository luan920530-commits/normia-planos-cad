; Instalador de Normia Planos CAD para Windows 10 y 11 (x64).
; Se instala por usuario, sin pedir permisos de administrador, y no toca el
; registro más allá de lo necesario para desinstalar.

#ifndef AppVersion
  #define AppVersion "1.9.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\..\dist\win-app"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\..\dist"
#endif
#ifndef IconFile
  #define IconFile "..\..\..\dist\normia.ico"
#endif

[Setup]
AppId={{6F1C2B84-27A5-4B7E-9C3D-5E8A1F4D9B20}
AppName=Normia Planos CAD
AppVersion={#AppVersion}
AppPublisher=Normia
AppPublisherURL=https://github.com/luan920530-commits/normia-planos-cad
DefaultDirName={localappdata}\Programs\Normia Planos CAD
DefaultGroupName=Normia Planos CAD
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename=normia-planos-cad-{#AppVersion}-windows-x64
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\normia.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\..\..\LICENSE
CloseApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Dirs]
; La base y las sesiones viven en la carpeta del usuario; esta se crea aquí
; para que el primer arranque no dependa de permisos.
Name: "{localappdata}\Normia"; Permissions: users-full

[Icons]
Name: "{group}\Normia Planos CAD"; Filename: "{app}\Iniciar Normia.vbs"; IconFilename: "{app}\normia.ico"; Comment: "Abrir el editor en el navegador"
Name: "{group}\Detener Normia"; Filename: "{app}\Detener Normia.vbs"; IconFilename: "{app}\normia.ico"; Comment: "Cerrar el servidor local"
Name: "{group}\Desinstalar Normia Planos CAD"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Normia Planos CAD"; Filename: "{app}\Iniciar Normia.vbs"; IconFilename: "{app}\normia.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\Iniciar Normia.vbs"; Description: "Abrir Normia Planos CAD"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{app}\runtime\php.exe"; Parameters: """{app}\tools\desktop\launcher.php"" --stop"; Flags: runhidden; RunOnceId: "DetenerNormia"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\storage\sessions"
