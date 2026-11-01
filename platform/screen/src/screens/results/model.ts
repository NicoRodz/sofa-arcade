// The extra lines of the results screen (#kudos), as plain data: the games decide the lines, the screen only lays them out. Hidden when there are none.
export interface KudosView {
  lines: readonly string[];
  hidden: boolean;
}

export const kudosView = (lines: readonly string[]): KudosView => ({ lines, hidden: lines.length === 0 });
