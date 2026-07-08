"""Structured contracts between planner, executor, evaluator, and replanner agents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["low", "medium", "high"]
WorkflowRoute = Literal["standard", "menu_import"]


class PlanStep(BaseModel):
    step_id: str = Field(min_length=1, description="Stable step identifier, e.g. step_1")
    tool: str = Field(min_length=1, description="Tool name to call, e.g. list_products")
    action: str = Field(min_length=1, description="What this step should accomplish")
    reason: str = Field(min_length=1, description="Why this step is needed")
    expected_output: str = Field(
        default="",
        description="What a successful step should return",
    )
    requires_approval_before_execution: bool = Field(
        default=False,
        description="Whether this step must wait for owner approval",
    )


class WorkflowPlan(BaseModel):
    goal: str = Field(min_length=1, description="User goal in one line (Spanish)")
    requires_tools: bool = Field(
        default=True,
        description="False for greetings or requests answerable without tools",
    )
    requires_approval: bool = Field(
        default=False,
        description="Whether the overall workflow needs owner approval",
    )
    approval_reason: str | None = Field(
        default=None,
        description="Why approval is needed, when requires_approval is true",
    )
    risk_level: RiskLevel = Field(default="low")
    route: WorkflowRoute = Field(
        default="standard",
        description=(
            "standard = executor runs plan steps; menu_import = hand off to the "
            "dedicated menu import agent after planning"
        ),
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Critical gaps that must be resolved before execution",
    )
    steps: list[PlanStep] = Field(
        default_factory=list,
        description="Execution steps; empty when requires_tools is false",
    )
    success_criteria: list[str] = Field(
        default_factory=list,
        description="How to know the plan answered the user request",
    )
    stop_conditions: list[str] = Field(
        default_factory=list,
        description="Conditions that should halt execution",
    )

    @property
    def is_direct(self) -> bool:
        if self.is_menu_import_handoff:
            return False
        return not self.requires_tools or not self.steps

    @property
    def is_menu_import_handoff(self) -> bool:
        return self.route == "menu_import" and self.requires_tools


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
    step_id: str = Field(min_length=1, description="Plan step id, e.g. step_1")
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
        description="Built at the end of execution; data to answer the user request and plan goal",
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
        description="Extra internal notes for evaluator/replanner",
    )
    tools_used: list[str] = Field(
        default_factory=list,
        description="Tool names observed during the run (filled by orchestrator)",
    )


def clear_plan_approval_gates(plan: WorkflowPlan) -> WorkflowPlan:
    """Owner approval is disabled — always execute planned tools."""
    return plan.model_copy(
        update={
            "requires_approval": False,
            "approval_reason": None,
            "steps": [
                step.model_copy(update={"requires_approval_before_execution": False})
                for step in plan.steps
            ],
        }
    )


def clear_execution_approval_gates(execution: ExecutionRecord) -> ExecutionRecord:
    """Owner approval is disabled — mutations run when the executor calls tools."""
    return execution.model_copy(
        update={
            "requires_user_approval": False,
            "approval_reason": None,
        }
    )
