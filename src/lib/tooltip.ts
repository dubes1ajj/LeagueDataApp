export function getTooltipTrigger(isMobile: boolean): 'hover' | 'click' {
  return isMobile ? 'click' : 'hover';
}