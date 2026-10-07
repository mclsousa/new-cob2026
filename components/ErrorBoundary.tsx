// Se uma página quebrar (ex.: dado antigo inesperado), mostra um aviso só nela em vez de deixar o app em branco.
import React from 'react';
import { AlertTriangle, LayoutDashboard } from 'lucide-react';
import { Card, Button, EmptyState } from './ui';

interface Props { children: React.ReactNode; onReset: () => void }
interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  // o projeto não instala @types/react: declara o que a classe herda do React.Component
  declare props: Props;
  declare setState: (state: State) => void;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[página]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível abrir esta página"
          text="Algum dado salvo não está no formato esperado. Os seus dados continuam salvos. Tente de novo ou volte ao Painel."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => this.setState({ error: null })}>Tentar de novo</Button>
              <Button variant="primary" icon={LayoutDashboard} onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Ir para o Painel</Button>
            </div>
          }
        />
        <p className="text-[11px] text-muted text-center font-mono break-all px-4">{this.state.error.message}</p>
      </Card>
    );
  }
}
