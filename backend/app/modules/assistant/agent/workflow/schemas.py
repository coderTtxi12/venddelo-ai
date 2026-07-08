"""Structured contracts between router, executor, evaluator, and responder agents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RouteTarget = Literal["executor", "responder", "menu_import"]


class WorkflowRouteDecision(BaseModel):
    route: RouteTarget = Field(
        description=(
            "executor = needs tools/data; responder = answer from conversation only; "
            "menu_import = full menu onboarding from uploaded documents"
        ),
    )
    goal: str = Field(min_length=1, description="User intent in one line (Spanish)")
    reason: str = Field(
        default="",
        description="Brief reason for this routing choice (Spanish)",
    )

    @property
    def is_direct(self) -> bool:
        return self.route == "responder"

    @property
    def is_menu_import(self) -> bool:
        return self.route == "menu_import"


class WorkflowEvaluation(BaseModel):
    ok: bool
    issues: list[str] = Field(default_factory=list)
    should_replan: bool = False
    user_facing_hint: str | None = Field(
        default=None,
        description="Optional hint for the responder when ok=false but no replan",
    )


ExecutionStatus = Literal["success", "partial_success", "failed"]
ExecutedStepStatus = Literal["success", "failed", "skipped"]


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
    """Structured output from the executor agent after running tools."""

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
        description="Extra internal notes for evaluator/responder",
    )
    tools_used: list[str] = Field(
        default_factory=list,
        description="Tool names observed during the run (filled by orchestrator)",
    )


def clear_execution_approval_gates(execution: ExecutionRecord) -> ExecutionRecord:
    """Owner approval is disabled — mutations run when the executor calls tools."""
    return execution.model_copy(
        update={
            "requires_user_approval": False,
            "approval_reason": None,
        }
    )


def execution_needs_user_clarification(execution: ExecutionRecord) -> bool:
    """Executor stopped for missing owner input — another tool pass will not help."""
    if not execution.notes:
        return False
    if execution.executed_steps or execution.tools_used:
        return False
    return True


def adjust_evaluation_for_execution(
    evaluation: WorkflowEvaluation,
    execution: ExecutionRecord,
) -> WorkflowEvaluation:
    if not execution_needs_user_clarification(execution):
        return evaluation
    hint = evaluation.user_facing_hint
    if not hint and execution.notes:
        hint = execution.notes[0]
    return evaluation.model_copy(
        update={
            "ok": False,
            "should_replan": False,
            "user_facing_hint": hint,
        }
    )
