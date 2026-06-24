/** Libellé directionnel à partir d'un angle de virage signé (deg). */
export interface TurnLabel {
  icon: string;
  txt: string;
}

export function turnLabel(turn: number): TurnLabel {
  const a = Math.abs(turn);
  if (a < 22) return { icon: '↑', txt: 'tout droit' };
  if (a < 55) return turn > 0 ? { icon: '↗', txt: 'à droite' } : { icon: '↖', txt: 'à gauche' };
  return turn > 0 ? { icon: '↱', txt: 'à droite' } : { icon: '↰', txt: 'à gauche' };
}
