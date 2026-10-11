// Si una pantalla falla al dibujarse (o no se puede cargar tras una actualización de la app), en vez de dejar la página
// en blanco se enseña un aviso con opción de reintentar o recargar. El menú lateral sigue funcionando.

import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Error de pantalla:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="p-8 max-w-xl" role="alert">
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Algo ha fallado en esta pantalla</h1>
        <p className="text-sm text-slate-600 mb-4">
          No se ha perdido nada de lo ya guardado. Prueba a reintentar; si sigue igual, recarga la página
          (puede que la aplicación se haya actualizado).
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Recargar la página</button>
        </div>
      </div>
    )
  }
}
