export const INSPECT_REQUEST_EVENT = "rchi:inspect-request";
export const INSPECT_RESPONSE_EVENT = "rchi:inspect-response";

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "SET_ENABLED"; enabled: boolean };

export interface StateResponse {
  enabled: boolean;
}

export interface InspectRequest {
  requestId: number;
  componentIndex?: number;
}

export interface InspectResponse {
  requestId: number;
  componentName: string;
  componentIndex: number;
  componentCount: number;
}
