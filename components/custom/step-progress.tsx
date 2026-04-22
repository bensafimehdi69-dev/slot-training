interface StepProgressProps {
  currentStep: number
  totalSteps: number
  label?: string
}

export function StepProgress({
  currentStep,
  totalSteps,
  label,
}: StepProgressProps) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{label || `Étape ${currentStep}/${totalSteps}`}</span>
        <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  )
}
