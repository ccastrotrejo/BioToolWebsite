import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Protein, Residue } from '@biotool/core/domain/types';
import { analyzeProtein } from '@biotool/core/analysis/analyze';
import { CompositionPanel } from './CompositionPanel';
import { SequencePanel } from './SequencePanel';
import { TripletPanel } from './TripletPanel';

function makeProtein(count: number): Protein {
  const residues: Residue[] = Array.from({ length: count }, (_, index) => ({
    key: `A:${index + 1}`, chainKey: 'A', authChain: 'A', labelChain: 'A',
    authSeq: String(index + 1), labelSeq: String(index + 1), insertion: '',
    name: 'ALA', aminoAcid: 'A', index, atomIndices: [index], ca: [index, 0, 0],
  }));
  return {
    title: 'Synthetic sequence control fixture', modelNumber: '1', warnings: [], residues,
    chains: [{ key: 'A', label: 'A', authId: 'A', labelId: 'A', residues, sequence: 'A'.repeat(count) }],
    atoms: residues.map((residue) => ({
      name: 'CA', element: 'C', position: residue.ca, residueKey: residue.key,
      alternate: '', occupancy: 1, bFactor: 20,
    })),
  };
}

describe('linked analysis controls', () => {
  it('selects a residue and supports keyboard navigation across sequence pages', async () => {
    const user = userEvent.setup();
    const protein = makeProtein(75);
    const props = { protein, analysis: analyzeProtein(protein), chainKey: null, selection: [],
      onSelect: vi.fn(), onHover: vi.fn(), onFasta: vi.fn() };
    render(<SequencePanel {...props} />);
    expect(screen.getAllByRole('button', { name: /^ALA,/ })).toHaveLength(60);
    const first = screen.getByRole('button', { name: /author position 1,/ });
    await user.click(first);
    expect(props.onSelect).toHaveBeenLastCalledWith(['A:1']);
    await user.keyboard('{End}');
    await waitFor(() => expect(screen.getByRole('button', { name: /author position 75,/ })).toHaveFocus());
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.getByRole('button', { name: /author position 74,/ })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenLastCalledWith(['A:74']);
    await user.click(screen.getByRole('button', { name: 'FASTA' }));
    expect(props.onFasta).toHaveBeenCalledOnce();
  });

  it('reveals selections made in another linked view', async () => {
    const protein = makeProtein(75);
    render(<SequencePanel protein={protein} analysis={analyzeProtein(protein)} chainKey={null}
      selection={['A:70']} onSelect={vi.fn()} onHover={vi.fn()} onFasta={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /author position 70,/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('61–75 of 75 residues')).toBeInTheDocument();
  });

  it('uses chain-relative sequence positions even when source indices are global', async () => {
    const user = userEvent.setup();
    const protein = makeProtein(6);
    for (const residue of protein.residues) residue.index += 100;
    const onSelect = vi.fn();
    render(<SequencePanel protein={protein} analysis={analyzeProtein(protein)} chainKey={null}
      selection={['A:1']} onSelect={onSelect} onHover={vi.fn()} onFasta={vi.fn()} />);
    const first = screen.getByRole('button', { name: /author position 1, observed position 1/ });
    await user.click(first);
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('button', { name: /author position 2, observed position 2/ })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(['A:2']);
  });

  it('composition selects actual residue identities and exposes all amino-acid counts', async () => {
    const user = userEvent.setup();
    const protein = makeProtein(6);
    const onSelect = vi.fn();
    render(<CompositionPanel analysis={analyzeProtein(protein)} protein={protein} chainKey={null} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /alanine: 6 residues/i }));
    expect(onSelect).toHaveBeenCalledWith(protein.residues.map((residue) => residue.key));
    await user.click(screen.getByRole('button', { name: 'Show all 20 amino acids' }));
    expect(screen.getAllByRole('button', { name: /Highlight residues/ })).toHaveLength(20);
    await user.click(screen.getByText('Composition table'));
    expect(screen.getByRole('table', { name: 'Observed amino acids' })).toBeVisible();
  });

  it('bounds triplet rendering while preserving repeated instances', async () => {
    const user = userEvent.setup();
    const protein = makeProtein(123);
    const onSelect = vi.fn();
    render(<TripletPanel analysis={analyzeProtein(protein)} protein={protein} onSelect={onSelect} />);
    expect(screen.getAllByRole('button', { name: /^AAA,/ })).toHaveLength(40);
    await user.click(screen.getByRole('button', { name: 'Next triplet page' }));
    const last = screen.getByRole('button', { name: /^AAA,/ });
    expect(last).toHaveAccessibleName(/observed positions 121 to 123/);
    await user.click(last);
    expect(onSelect).toHaveBeenCalledWith(['A:121', 'A:122', 'A:123']);
  });
});
