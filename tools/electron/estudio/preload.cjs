/*
 * Normia Estudio · puente entre la página del editor y el proceso principal.
 *
 * La página no tiene Node ni acceso al disco: solo puede pedir cuatro cosas
 * —abrir, guardar, guardar como y avisar del título— y recibir órdenes del menú.
 * Todo lo demás (leer un archivo, elegir carpeta, escribir) ocurre en el proceso
 * principal, que sí controla los diálogos del sistema.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('NormiaEstudio', {
  /** Abre un plano. Sin ruta, muestra el diálogo del sistema. */
  abrir: (payload = {}) => ipcRenderer.invoke('estudio:abrir', payload),
  /** Guarda en la ruta conocida; si no la hay, el principal pide una. */
  guardar: (payload = {}) => ipcRenderer.invoke('estudio:guardar', payload),
  /** Guarda con el diálogo del sistema siempre. */
  guardarComo: (payload = {}) => ipcRenderer.invoke('estudio:guardar-como', payload),
  /** Título de la ventana y estado de documento (macOS). */
  titulo: (payload = {}) => ipcRenderer.invoke('estudio:titulo', payload),
  /** Avisa de cambios sin guardar para no cerrar perdiéndolos. */
  estado: (payload = {}) => ipcRenderer.send('estudio:estado', payload),
  /** Órdenes del menú: nuevo, abrir, guardar, guardar-como, ayuda. */
  alComando: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => callback(String(command || ''));
    ipcRenderer.on('estudio:comando', listener);
    return () => ipcRenderer.removeListener('estudio:comando', listener);
  },
});
