import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const TerminalDirectionSchema = StringEnum(["right", "down"] as const, {
  description: "Direction for the new pane. If omitted, the terminal chooses the largest available space.",
});

export const ThinkingLevelSchema = StringEnum(["off", "minimal", "low", "medium", "high", "xhigh"] as const, {
  description: "Thinking level passed to pi via --thinking.",
});

export const AgentScopeSchema = StringEnum(
  ["user", "project", "both"] as const,
  {
    description: 'Which agent directories to use. Default: "user".',
  },
);

export const TargetSchema = Type.Object({
  type: Type.Optional(StringEnum(["pane"] as const, { description: 'Target type. Currently only "pane" is supported.' })),
  direction: Type.Optional(TerminalDirectionSchema),
  floating: Type.Optional(Type.Boolean({ description: "Open as a floating pane. Mutually exclusive with direction." })),
}, { description: "Terminal target configuration. Defaults to a tiled pane." });
