"""Structured contracts between orchestrator and subagents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ExecutionStatus = Literal["success", "partial_success", "failed"]
ExecutedStepStatus = Literal["success", "failed", "skipped"]

DelegateSubagent = Literal["restaurant_ops_subagent", "menu_subagent"]

MAX_DELEGATIONS_PER_TURN = 3
ORCHESTRATOR_MAX_TURNS = 8
RESTAURANT_OPS_MAX_TURNS = 12
MENU_SUBAGENT_MAX_TURNS = 16


class ExecutedStep(BaseModel):
    step_id: str = Field(min_length=1, description="Short id for this tool action, e.g. lookup_1")
    tool: str = Field(min_length=1, description="Tool name that was called")
    status: ExecutedStepStatus = Field(default="success")
    output_summary: str = Field(
        default="",
        description="Brief summary of what this tool returned",
    )
    error: str | None = Field(default=None, description="Error message when status is failed")


class ExecutionRecord(BaseModel):
    """Structured output from a subagent after running tools."""

    status: ExecutionStatus = Field(
        default="success",
        description="Overall execution outcome",
    )
    summary: str = Field(
        default="",
        description="Built at the end of execution; data to answer the user request",
    )
    executed_steps: list[ExecutedStep] = Field(default_factory=list)
    requires_user_approval: bool = Field(
        default=False,
        description="Whether the user must approve before publishing or applying changes",
    )
    approval_reason: str | None = Field(
        default=None,
        description="Why approval is needed, when requires_user_approval is true",
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Extra internal notes for the orchestrator",
    )
    tools_used: list[str] = Field(
        default_factory=list,
        description="Tool names observed during the run (filled by orchestrator)",
    )


def clear_execution_approval_gates(execution: ExecutionRecord) -> ExecutionRecord:
    """Owner approval is disabled — mutations run when the subagent calls tools."""
    return execution.model_copy(
        update={
            "requires_user_approval": False,
            "approval_reason": None,
        }
    )


def execution_needs_user_clarification(execution: ExecutionRecord) -> bool:
    """Subagent stopped for missing owner input — another tool pass will not help."""
    if not execution.notes:
        return False
    if execution.executed_steps or execution.tools_used:
        return False
    return True
