import { Bond, StructureElement } from 'molstar/lib/mol-model/structure';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { Color } from 'molstar/lib/mol-util/color';
import { TableLegend } from 'molstar/lib/mol-util/legend';
import { analyzeProtein } from '../analysis/analyze';
import type { Protein, TripletClass } from '../domain/types';
import type { ResidueMap } from './residue-map';

export const propensityColors: Record<TripletClass, Color> = {
  alpha: Color(0x37cbd3),
  beta: Color(0x62c68b),
  turn: Color(0xe5b753),
  random: Color(0xab8bea),
};
export const unknownColor = Color(0x8b95a5);

/** Colors empirical triplet propensity, never the structure's secondary-structure property. */
export function createPropensityTheme(protein: Protein, mapping: ResidueMap): ColorTheme.Provider<{}> {
  const colors = new Map<string, Color>();
  for (const triplet of analyzeProtein(protein).triplets) {
    for (const key of triplet.residueKeys) colors.set(key, propensityColors[triplet.classification]);
  }
  const location = StructureElement.Location.create(mapping.structure);
  const factory: ColorTheme.Factory<{}, 'group'> = (_context, props) => ({
    factory,
    props,
    granularity: 'group',
    preferSmoothing: false,
    color: atom => {
      if (StructureElement.Location.is(atom)) {
        const residue = mapping.residueAt(atom);
        return residue ? colors.get(residue.key) ?? unknownColor : unknownColor;
      }
      if (Bond.isLocation(atom)) {
        const element = atom.aUnit.elements[atom.aIndex];
        if (element === undefined) return unknownColor;
        StructureElement.Location.set(location, atom.aStructure, atom.aUnit, element);
        const residue = mapping.residueAt(location);
        return residue ? colors.get(residue.key) ?? unknownColor : unknownColor;
      }
      return unknownColor;
    },
    description: 'BioTool empirical triplet propensity, not assigned secondary structure.',
    legend: TableLegend([
      ['Alpha propensity', propensityColors.alpha],
      ['Beta propensity', propensityColors.beta],
      ['Turn propensity', propensityColors.turn],
      ['Random propensity', propensityColors.random],
      ['Unclassified / terminal remainder', unknownColor],
    ]),
  });
  return {
    name: 'biotool-propensity',
    label: 'BioTool triplet propensity',
    category: ColorTheme.Category.Residue,
    factory,
    getParams: () => ({}),
    defaultValues: {},
    isApplicable: context => !!context.structure,
  };
}
