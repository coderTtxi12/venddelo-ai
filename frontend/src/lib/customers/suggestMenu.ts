export type SuggestMenuState = { open: boolean };

export type SuggestMenuAction =
  | { type: 'focus' }
  | { type: 'user-edit' }
  | { type: 'select' }
  | { type: 'dismiss' };

export function reduceSuggestMenu(
  state: SuggestMenuState,
  action: SuggestMenuAction,
): SuggestMenuState {
  switch (action.type) {
    case 'focus':
    case 'user-edit':
      return { open: true };
    case 'select':
    case 'dismiss':
      return { open: false };
  }
}
