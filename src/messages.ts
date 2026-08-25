export const INSPECT_REQUEST_EVENT = "rchi:inspect-request";
export const INSPECT_RESPONSE_EVENT = "rchi:inspect-response";

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "OPEN_SOURCE"; sourceLocation: SourceLocation };

export interface StateResponse {
  enabled: boolean;
}

export interface OpenSourceResponse {
  ok: boolean;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  nodeName: string;
  serverPort: number;
}

export interface InspectRequest {
  requestId: number;
  componentIndex?: number;
}

export interface HighlightBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InspectResponse {
  requestId: number;
  componentName: string;
  componentIndex: number;
  componentCount: number;
  highlightBounds: HighlightBounds;
  sourceLocation: SourceLocation | null;
}
