/**
 * Dynamic Renderer Component
 * Renders AI-generated applications on the fly
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useUISpec, useIsLoading, useError, useGenerationThoughts, useAppActions, UIComponent } from '../store/appStore';
import { logger } from '../utils/logger';
import './DynamicRenderer.css';

// ============================================================================
// Component State Manager
// ============================================================================

class ComponentState {
  private state: Map<string, any> = new Map();
  private listeners: Map<string, Set<(value: any) => void>> = new Map();

  get(key: string, defaultValue: any = null): any {
    return this.state.get(key) ?? defaultValue;
  }

  set(key: string, value: any): void {
    this.state.set(key, value);
    // Notify listeners
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(listener => listener(value));
    }
  }

  subscribe(key: string, listener: (value: any) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }

  clear(): void {
    this.state.clear();
    this.listeners.clear();
  }
}

// ============================================================================
// Tool Execution
// ============================================================================

class ToolExecutor {
  private componentState: ComponentState;
  private appId: string | null = null;

  constructor(componentState: ComponentState) {
    this.componentState = componentState;
  }

  setAppId(appId: string): void {
    this.appId = appId;
  }

  async execute(toolId: string, params: Record<string, any> = {}): Promise<any> {
    const startTime = performance.now();
    try {
      logger.debug('Executing tool', {
        component: 'ToolExecutor',
        toolId,
        paramsCount: Object.keys(params).length
      });

      // Check if this is a service tool (contains service prefix like storage.*, auth.*, ai.*)
      const servicePrefixes = ['storage', 'auth', 'ai', 'sync', 'media'];
      const [category] = toolId.split('.');
      
      let result;
      if (servicePrefixes.includes(category)) {
        result = await this.executeServiceTool(toolId, params);
      } else {
        // Handle built-in tools
        switch (category) {
          case 'calc':
            result = this.executeCalcTool(toolId.split('.')[1], params);
            break;
          case 'ui':
            result = this.executeUITool(toolId.split('.')[1], params);
            break;
          case 'system':
            result = this.executeSystemTool(toolId.split('.')[1], params);
            break;
          case 'app':
            result = await this.executeAppTool(toolId.split('.')[1], params);
            break;
          case 'http':
            result = await this.executeNetworkTool(toolId.split('.')[1], params);
            break;
          case 'timer':
            result = this.executeTimerTool(toolId.split('.')[1], params);
            break;
          default:
            logger.warn('Unknown tool category', { 
              component: 'ToolExecutor',
              category,
              toolId 
            });
            result = null;
        }
      }

      const duration = performance.now() - startTime;
      logger.performance('Tool execution', duration, {
        component: 'ToolExecutor',
        toolId
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error('Tool execution failed', error as Error, {
        component: 'ToolExecutor',
        toolId,
        duration
      });
      this.componentState.set('error', `Tool ${toolId} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private async executeServiceTool(toolId: string, params: Record<string, any>): Promise<any> {
    console.log(`[ToolExecutor] Executing service tool: ${toolId}`);
    
    try {
      const response = await fetch('http://localhost:8000/services/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: toolId,
          params: params,
          app_id: this.appId
        })
      });

      if (!response.ok) {
        throw new Error(`Service call failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Service execution failed');
      }

      console.log(`[ToolExecutor] Service tool result:`, result.data);
      return result.data;
      
    } catch (error) {
      console.error(`[ToolExecutor] Service tool error:`, error);
      throw error;
    }
  }

  private executeCalcTool(action: string, params: Record<string, any>): any {
    const a = params.a || 0;
    const b = params.b || 0;

    switch (action) {
      case 'add':
        return a + b;
      case 'subtract':
        return a - b;
      case 'multiply':
        return a * b;
      case 'divide':
        return b !== 0 ? a / b : 'Error';
      case 'append_digit':
        const current = this.componentState.get('display', '0');
        const digit = params.digit || '';
        const newValue = current === '0' ? digit : current + digit;
        this.componentState.set('display', newValue);
        return newValue;
      case 'clear':
        this.componentState.set('display', '0');
        return '0';
      case 'evaluate':
        try {
          const expression = this.componentState.get('display', '0');
          // Simple eval (in production, use a proper math parser!)
          const result = eval(expression.replace('×', '*').replace('÷', '/').replace('−', '-'));
          this.componentState.set('display', String(result));
          return result;
        } catch {
          this.componentState.set('display', 'Error');
          return 'Error';
        }
      default:
        return null;
    }
  }

  private executeUITool(action: string, params: Record<string, any>): any {
    switch (action) {
      case 'set_state':
        this.componentState.set(params.key, params.value);
        return params.value;
      case 'get_state':
        return this.componentState.get(params.key);
      case 'add_todo':
        const todos = this.componentState.get('todos', []);
        const newTask = this.componentState.get('task-input', '');
        if (newTask.trim()) {
          todos.push({ id: Date.now(), text: newTask, done: false });
          this.componentState.set('todos', [...todos]);
          this.componentState.set('task-input', '');
        }
        return todos;
      default:
        return null;
    }
  }

  private executeSystemTool(action: string, params: Record<string, any>): any {
    switch (action) {
      case 'alert':
        alert(params.message);
        return true;
      case 'log':
        console.log(`[System] ${params.message}`);
        return true;
      default:
        return null;
    }
  }

  private async executeAppTool(action: string, params: Record<string, any>): Promise<any> {
    switch (action) {
      case 'spawn':
        console.log(`[App] Spawning new app: ${params.request}`);
        // Use HTTP endpoint for app spawning instead of creating new WebSocket
        const response = await fetch('http://localhost:8000/generate-ui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: params.request,
            context: { parent_app_id: this.componentState.get('app_id') }
          })
        });
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        // Notify parent component to render new app
        window.postMessage({ 
          type: 'spawn_app', 
          app_id: data.app_id,
          ui_spec: data.ui_spec 
        }, '*');
        
        return data.ui_spec;
        
      case 'close':
        console.log('[App] Closing current app');
        // Notify parent to close this app
        window.postMessage({ type: 'close_app' }, '*');
        return true;
        
      case 'list':
        console.log('[App] Listing apps');
        const appsResponse = await fetch('http://localhost:8000/apps');
        const appsData = await appsResponse.json();
        return appsData.apps;
        
      default:
        return null;
    }
  }

  // Storage tools now handled by service system via executeServiceTool()

  private async executeNetworkTool(action: string, params: Record<string, any>): Promise<any> {
    switch (action) {
      case 'get':
        const getResponse = await fetch(params.url);
        return await getResponse.json();
      case 'post':
        const postResponse = await fetch(params.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params.data)
        });
        return await postResponse.json();
      default:
        return null;
    }
  }

  private executeTimerTool(action: string, params: Record<string, any>): any {
    switch (action) {
      case 'set':
        const timerId = setTimeout(() => {
          // Execute the action (would need tool executor reference)
          console.log(`[Timer] Executing delayed action: ${params.action}`);
        }, params.delay);
        this.componentState.set(`timer_${timerId}`, timerId);
        return timerId;
      case 'interval':
        const intervalId = setInterval(() => {
          console.log(`[Timer] Executing interval action: ${params.action}`);
        }, params.interval);
        this.componentState.set(`interval_${intervalId}`, intervalId);
        return intervalId;
      case 'clear':
        const id = this.componentState.get(params.timer_id);
        if (id) {
          clearTimeout(id);
          clearInterval(id);
        }
        return true;
      default:
        return null;
    }
  }
}

// ============================================================================
// Component Renderers
// ============================================================================

interface RendererProps {
  component: UIComponent;
  state: ComponentState;
  executor: ToolExecutor;
}

const ComponentRenderer: React.FC<RendererProps> = ({ component, state, executor }) => {
  const [, forceUpdate] = useState({});

  // Subscribe to state changes for this component
  React.useEffect(() => {
    if (component.id) {
      const unsubscribe = state.subscribe(component.id, () => {
        forceUpdate({});
      });
      return unsubscribe;
    }
  }, [component.id, state]);

  const handleEvent = useCallback((eventName: string, eventData?: any) => {
    const toolId = component.on_event?.[eventName];
    if (toolId) {
      // Extract params from event or component
      const params = {
        ...eventData,
        componentId: component.id,
        digit: component.props.text, // For calculator buttons
      };
      executor.execute(toolId, params);
    }
  }, [component, executor]);

  // Render based on component type
  switch (component.type) {
    case 'button':
      return (
        <button
          className="dynamic-button"
          onClick={() => handleEvent('click')}
          style={component.props.style}
        >
          {component.props.text || 'Button'}
        </button>
      );

    case 'input':
      const value = state.get(component.id, component.props.value || '');
      return (
        <input
          className="dynamic-input"
          type={component.props.type || 'text'}
          placeholder={component.props.placeholder}
          value={value}
          readOnly={component.props.readonly}
          onChange={(e) => state.set(component.id, e.target.value)}
          style={component.props.style}
        />
      );

    case 'text':
      const variant = component.props.variant || 'body';
      const Tag = variant === 'h1' ? 'h1' : variant === 'h2' ? 'h2' : 'p';
      return (
        <Tag className={`dynamic-text dynamic-text-${variant}`} style={component.props.style}>
          {component.props.content}
        </Tag>
      );

    case 'container':
      return (
        <div
          className={`dynamic-container dynamic-container-${component.props.layout || 'vertical'}`}
          style={{ gap: `${component.props.gap || 8}px`, ...component.props.style }}
        >
          {component.children?.map((child: UIComponent, idx: number) => (
            <ComponentRenderer
              key={`${child.id}-${idx}`}
              component={child}
              state={state}
              executor={executor}
            />
          ))}
        </div>
      );

    case 'grid':
      return (
        <div
          className="dynamic-grid"
          style={{
            gridTemplateColumns: `repeat(${component.props.columns || 3}, 1fr)`,
            gap: `${component.props.gap || 8}px`,
            ...component.props.style,
          }}
        >
          {component.children?.map((child: UIComponent, idx: number) => (
            <ComponentRenderer
              key={`${child.id}-${idx}`}
              component={child}
              state={state}
              executor={executor}
            />
          ))}
        </div>
      );

    default:
      return (
        <div className="dynamic-unknown">
          Unknown component: {component.type}
        </div>
      );
  }
};

// ============================================================================
// Main DynamicRenderer Component
// ============================================================================

const DynamicRenderer: React.FC = () => {
  const { client, isConnected, generateUI } = useWebSocket();
  
  // Zustand store hooks - only re-render when these specific values change
  const uiSpec = useUISpec();
  const isLoading = useIsLoading();
  const error = useError();
  const generationThoughts = useGenerationThoughts();
  const { 
    setUISpec, 
    setLoading, 
    setError, 
    addGenerationThought, 
    clearGenerationThoughts 
  } = useAppActions();
  
  const [componentState] = useState(() => {
    logger.info('Initializing component state', { component: 'DynamicRenderer' });
    return new ComponentState();
  });
  const [toolExecutor] = useState(() => {
    logger.info('Initializing tool executor', { component: 'DynamicRenderer' });
    return new ToolExecutor(componentState);
  });

  const loadUISpec = useCallback(async (request: string) => {
    // Check connection - only use React state for reliability in strict mode
    if (!isConnected || !client) {
      const errorMsg = 'Not connected to AI service';
      setError(errorMsg);
      logger.error(errorMsg, undefined, {
        component: 'DynamicRenderer',
        isConnected,
        hasClient: !!client
      });
      return;
    }

    logger.info('Loading UI spec', {
      component: 'DynamicRenderer',
      request,
      requestLength: request.length
    });

    setLoading(true);
    setError(null);
    clearGenerationThoughts();
    
    try {
      // Use type-safe WebSocket client
      generateUI(request, {});
      logger.debug('UI generation request sent', { component: 'DynamicRenderer' });
    } catch (err) {
      logger.error('Failed to send UI generation request', err as Error, { 
        component: 'DynamicRenderer',
        request 
      });
      setError(err instanceof Error ? err.message : 'Failed to send request');
      setLoading(false);
    }
  }, [isConnected, client, generateUI, setLoading, setError, clearGenerationThoughts]);

  // Listen for WebSocket messages
  useEffect(() => {
    if (!client) return;

    logger.debug('Setting up WebSocket message listener', { component: 'DynamicRenderer' });

    const unsubscribe = client.onMessage((message) => {
      logger.debugThrottled('Received WebSocket message', {
        component: 'DynamicRenderer',
        messageType: message.type
      });
      
      switch (message.type) {
        case 'generation_start':
          logger.info('UI generation started', {
            component: 'DynamicRenderer',
            message: message.message
          });
          addGenerationThought(message.message);
          break;
          
        case 'thought':
          logger.verboseThrottled('Generation thought received', {
            component: 'DynamicRenderer',
            content: message.content
          });
          addGenerationThought(message.content);
          break;
          
        case 'ui_generated':
          logger.info('UI generated successfully', {
            component: 'DynamicRenderer',
            title: message.ui_spec.title,
            appId: message.app_id,
            componentCount: message.ui_spec.components.length
          });
          setUISpec(message.ui_spec, message.app_id);
          componentState.clear();
          componentState.set('app_id', message.app_id);
          toolExecutor.setAppId(message.app_id);
          
          // Execute lifecycle hooks (on_mount)
          if (message.ui_spec.lifecycle_hooks?.on_mount) {
            logger.info('Executing on_mount lifecycle hooks', {
              component: 'DynamicRenderer',
              hookCount: message.ui_spec.lifecycle_hooks.on_mount.length
            });
            message.ui_spec.lifecycle_hooks.on_mount.forEach(async (toolId: string) => {
              try {
                await toolExecutor.execute(toolId, {});
              } catch (error) {
                logger.error(`Failed to execute on_mount hook: ${toolId}`, error as Error, {
                  component: 'DynamicRenderer',
                  toolId
                });
              }
            });
          }
          break;
          
        case 'complete':
          logger.info('UI generation complete', { component: 'DynamicRenderer' });
          setLoading(false);
          break;
          
        case 'error':
          logger.error('UI generation error', undefined, {
            component: 'DynamicRenderer',
            message: message.message
          });
          setError(message.message);
          break;
          
        default:
          // Ignore other message types
          break;
      }
    });

    return () => {
      logger.debug('Cleaning up WebSocket message listener', { component: 'DynamicRenderer' });
      unsubscribe();
    };
  }, [client, componentState, toolExecutor, setUISpec, setLoading, setError, addGenerationThought]);

  // Cleanup: Execute on_unmount hooks when component unmounts or UI changes
  useEffect(() => {
    return () => {
      if (uiSpec?.lifecycle_hooks?.on_unmount) {
        console.log('[DynamicRenderer] Executing on_unmount hooks');
        uiSpec.lifecycle_hooks.on_unmount.forEach(async (toolId: string) => {
          try {
            await toolExecutor.execute(toolId, {});
          } catch (error) {
            console.error(`[DynamicRenderer] Error executing on_unmount hook ${toolId}:`, error);
          }
        });
      }
    };
  }, [uiSpec, toolExecutor]);

  // Example: Load calculator on mount (for testing)
  // Wait for WebSocket connection before attempting to load
  const hasAutoLoadedRef = React.useRef(false);
  
  React.useEffect(() => {
    if (isConnected && client && !uiSpec && !isLoading && !hasAutoLoadedRef.current) {
      // Add a longer delay to ensure connection is fully stable (especially in React Strict Mode)
      const timer = setTimeout(() => {
        // Double-check connection before loading
        if (client.isConnected()) {
          logger.info('Auto-loading calculator', { component: 'DynamicRenderer' });
          hasAutoLoadedRef.current = true;
          loadUISpec('create a calculator');
        } else {
          logger.warn('Skipping auto-load: WebSocket not ready', { 
            component: 'DynamicRenderer',
            isConnected,
            clientConnected: client.isConnected()
          });
        }
      }, 2000); // Increased to 2000ms for React Strict Mode stability
      return () => clearTimeout(timer);
    }
  }, [isConnected, client, uiSpec, isLoading, loadUISpec]);

  return (
    <div className="dynamic-renderer">
      <div className="renderer-header">
        <h3>⚡ App Renderer</h3>
        <span className={`renderer-status ${uiSpec ? 'active' : ''}`}>
          {isLoading ? 'Loading...' : uiSpec ? 'Active' : 'Ready'}
        </span>
      </div>

      <div className="renderer-canvas">
        {error && (
          <div className="renderer-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {isLoading && (
          <div className="generation-progress">
            <div className="generation-header">
              <div className="spinner"></div>
              <h3>🎨 Generating Application...</h3>
            </div>
            <div className="thoughts-list">
              {generationThoughts.map((thought, i) => (
                <div key={i} className="thought-item fade-in">
                  <span className="thought-icon">💭</span>
                  <span className="thought-text">{thought}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!uiSpec && !isLoading && !error && (
          <div className="placeholder">
            <span className="placeholder-icon">🎨</span>
            <h2>Dynamic App Canvas</h2>
            <p>AI-generated applications will render here in real-time</p>
            <div className="example-apps">
              <button className="app-card" onClick={() => loadUISpec('create a calculator')}>
                📱 Calculator
              </button>
              <button className="app-card" onClick={() => loadUISpec('create a todo app')}>
                📝 Todo App
              </button>
              <button className="app-card" onClick={() => loadUISpec('create a counter')}>
                🔢 Counter
              </button>
              <button className="app-card" onClick={() => loadUISpec('create a settings page')}>
                ⚙️ Settings
              </button>
            </div>
          </div>
        )}

        {uiSpec && (
          <div className="rendered-app" style={uiSpec.style}>
            <div className="app-header">
              <h2>{uiSpec.title}</h2>
            </div>
            <div className={`app-content app-layout-${uiSpec.layout}`}>
              {uiSpec.components.map((component, idx) => (
                <ComponentRenderer
                  key={`${component.id}-${idx}`}
                  component={component}
                  state={componentState}
                  executor={toolExecutor}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicRenderer;

