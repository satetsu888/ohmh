import { VscodeButton } from "@vscode-elements/react-elements"
import { ConnectMessage, DisconnectMessage, InitialLoadMessage, SignInMessage, SaveViewStateMessage, UseAsGuestMessage } from "../messages";
import { useExtensionState } from "../hooks/useExtensionState";
import { useEffect } from "react";
import { WebhooksTable } from "./WebhooksTable";
import { VSCodeApi } from "../types/vscode";

// acquireVsCodeApi は1回だけ呼び出す
const vscode: VSCodeApi = acquireVsCodeApi();

const App = () => {
  const {
    hasSession,
    isGuestMode,
    webhooks,
    expandedWebhooks,
    setExpandedWebhooks,
    requestsData,
    setRequestsData,
    forwardResults,
    isInitialized,
    selectedRequestModal,
    setSelectedRequestModal
  } = useExtensionState(vscode);

  useEffect(() => {
    vscode.postMessage(InitialLoadMessage);
  }, []);

  // Save view state when it changes
  useEffect(() => {
    if (expandedWebhooks.length > 0 || Object.keys(requestsData).length > 0 || selectedRequestModal) {
      vscode.postMessage(SaveViewStateMessage(expandedWebhooks, requestsData, selectedRequestModal));
    }
  }, [expandedWebhooks, requestsData, selectedRequestModal]);

  // Show loading state until initialized
  if (!isInitialized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: 'var(--vscode-foreground)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="codicon codicon-loading oh-my-hooks-spin" style={{ fontSize: '24px' }} />
          <div style={{ marginTop: '10px' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // 未認証 & guest mode でもない: ログイン画面
  if (!hasSession && !isGuestMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', padding: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <VscodeButton
          onClick={() => {
            vscode.postMessage(SignInMessage);
          }}
        >
          Login with GitHub
        </VscodeButton>
        <VscodeButton
          secondary
          onClick={() => {
            vscode.postMessage(UseAsGuestMessage);
          }}
        >
          Use as Guest
        </VscodeButton>
      </div>
    );
  }

  return (
    <>
      {isGuestMode && (
        <div style={{
          padding: '8px 12px',
          fontSize: '11px',
          color: 'var(--vscode-descriptionForeground)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid var(--vscode-panel-border, transparent)',
        }}>
          <span className="codicon codicon-eye-closed" style={{ fontSize: '12px', opacity: 0.7 }} />
          <span>Guest mode</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <a
            role="button"
            tabIndex={0}
            onClick={() => vscode.postMessage(SignInMessage)}
            onKeyDown={(e) => { if (e.key === 'Enter') vscode.postMessage(SignInMessage); }}
            style={{
              color: 'var(--vscode-descriptionForeground)',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--vscode-textLink-foreground)';
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--vscode-descriptionForeground)';
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            Login with GitHub
          </a>
        </div>
      )}
      <WebhooksTable
        webhooks={webhooks}
        isGuestMode={isGuestMode}
        startConnect={(webhookId: string, port: number) => {
          vscode.postMessage(ConnectMessage(webhookId, port));
        }}
        stopConnect={(webhookId: string) => {
          vscode.postMessage(DisconnectMessage(webhookId));
        }}
        vscode={vscode}
        expandedWebhooks={expandedWebhooks}
        setExpandedWebhooks={setExpandedWebhooks}
        requestsData={requestsData}
        setRequestsData={setRequestsData}
        forwardResults={forwardResults}
        selectedRequestModal={selectedRequestModal}
        setSelectedRequestModal={setSelectedRequestModal}
      />
    </>
  );
};

export default App;
