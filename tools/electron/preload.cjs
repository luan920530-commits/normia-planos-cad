/*
 * Puente entre la ventana y Electron.
 *
 * La página NO tiene acceso a Node: solo recibe estas cuatro funciones, y solo
 * las que la aplicación usa de verdad (imprimir, saber dónde están sus datos,
 * consultar la carpeta y la plataforma).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('normiaDesktop', {
  plataforma: process.platform,
  imprimir: () => ipcRenderer.invoke('normia:imprimir'),
  carpetaDeDatos: () => ipcRenderer.invoke('normia:datos'),
  esEscritorio: true,
});
