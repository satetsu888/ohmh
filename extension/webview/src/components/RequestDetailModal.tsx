import React, { useEffect, useState } from 'react';
import { WebhookSourceRequest } from '../../../core/src/api';
import { VscodeButton } from '@vscode-elements/react-elements';
import { VSCodeApi } from '../types/vscode';
import { Webhook } from '../../../core/src/stateStore';
import { ResendRequestMessage } from '../messages';
import { fetchWebhookRequestDetail } from '../utils/fetchWebhookRequestDetail';
import { ForwardResult } from '../hooks/useExtensionState';

type Props = {
  request: WebhookSourceRequest | null;
  forwardResult: ForwardResult | null;
  onClose: () => void;
  vscode: VSCodeApi;
  webhookId: string;
  webhook: Webhook;
};

export const RequestDetailModal: React.FC<Props> = ({ request, forwardResult, onClose, vscode, webhookId, webhook }) => {
  const [fullRequest, setFullRequest] = useState<WebhookSourceRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!request) {
      setFullRequest(null);
      setIsLoading(false);
      return;
    }
    if (webhook.isAnonymous || webhook.isEphemeral) {
      // Anon / ephemeral webhooks have no server-side history, so use the
      // request from props as-is (it came from the WS push).
      setFullRequest(request);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setFullRequest(null);
    setIsLoading(true);
    fetchWebhookRequestDetail(vscode, webhookId, request.id).then((detail) => {
      if (cancelled) return;
      setFullRequest(detail);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [request, vscode, webhookId, webhook.isAnonymous, webhook.isEphemeral]);
  
  useEffect(() => {
    const styleId = 'request-detail-modal-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .codicon-loading {
          animation: spin 1s linear infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
  
  if (!request) return null;

  // Use fullRequest where body / headers are needed; Basic Information only
  // needs the props.request.
  const displayRequest = fullRequest || request;
  const canResend = webhook.connection === 'connected' && fullRequest !== null;
  const resendTitle = webhook.connection !== 'connected'
    ? 'Connect to a local port to resend requests'
    : fullRequest === null
      ? 'Loading request body...'
      : 'Resend request';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatHeaders = (headers: Record<string, string> | undefined | null) => {
    if (!headers || typeof headers !== 'object') {
      return 'No headers';
    }
    return Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  };

  const formatBody = (body: string | null) => {
    if (!body) return 'No body';
    
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--vscode-editor-background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '4px',
          padding: '20px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Request Details</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <VscodeButton
              onClick={() => {
                if (canResend && fullRequest) {
                  vscode.postMessage(ResendRequestMessage(webhookId, fullRequest));
                }
              }}
              secondary
              disabled={!canResend}
              title={resendTitle}
            >
              <span className="codicon codicon-debug-restart" style={{ marginRight: '4px' }} />
              Resend
            </VscodeButton>
            <VscodeButton onClick={onClose} secondary>
              <span className="codicon codicon-close" />
            </VscodeButton>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '10px', color: 'var(--vscode-foreground)' }}>Basic Information</h3>
          <div style={{
            backgroundColor: 'var(--vscode-input-background)',
            padding: '10px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}>
            <div style={{ marginBottom: '5px' }}>
              <strong>Method:</strong> {displayRequest.method}
            </div>
            <div style={{ marginBottom: '5px' }}>
              <strong>Path:</strong> {displayRequest.url}
            </div>
            <div style={{ marginBottom: forwardResult ? '5px' : 0 }}>
              <strong>Timestamp:</strong> {formatDate(displayRequest.createdAt)}
            </div>
            {forwardResult && (
              <div>
                <strong>Last forward:</strong>{' '}
                {forwardResult.error !== null
                  ? <span style={{ color: 'var(--vscode-errorForeground)' }}>failed — {forwardResult.error}</span>
                  : <span>{forwardResult.status ?? '—'} ({forwardResult.durationMs}ms)</span>}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '10px', color: 'var(--vscode-foreground)' }}>Headers</h3>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <span className="codicon codicon-loading" style={{ fontSize: '16px' }} />
            </div>
          ) : (
          <pre style={{ 
            backgroundColor: 'var(--vscode-input-background)', 
            padding: '10px',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '200px',
            margin: 0,
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            {formatHeaders(displayRequest.headers)}
          </pre>
          )}
        </div>

        <div>
          <h3 style={{ marginBottom: '10px', color: 'var(--vscode-foreground)' }}>Body</h3>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <span className="codicon codicon-loading" style={{ fontSize: '16px' }} />
            </div>
          ) : (
          <pre style={{ 
            backgroundColor: 'var(--vscode-input-background)', 
            padding: '10px',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '300px',
            margin: 0,
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            {formatBody(displayRequest.body)}
          </pre>
          )}
        </div>
      </div>
    </div>
  );
};