<script setup lang="ts">
import { computed } from 'vue';
import type { LibraryHost, LibrarySnapshot } from '@biotool/contracts';
import LibraryIcon from './LibraryIcon.vue';

const props = defineProps<{
  snapshot: LibrarySnapshot;
  host: LibraryHost;
  idPrefix: string;
}>();

const savedIds = computed(() => new Set(props.snapshot.saved.map((item) => item.id)));
const additional = computed(() => {
  const catalogIds = new Set(props.snapshot.catalog.map((item) => item.id));
  return props.snapshot.saved.filter((item) => !catalogIds.has(item.id));
});
</script>

<template>
  <aside :id="`${idPrefix}-panel`" class="library-panel" :data-open="snapshot.panelOpen"
    data-framework="vue" :aria-labelledby="`${idPrefix}-heading`" tabindex="0">
    <div class="library-heading">
      <h2 :id="`${idPrefix}-heading`">Library</h2>
      <span class="count-label">{{ snapshot.saved.length }} saved</span>
    </div>
    <p class="library-intro">A few small structures.<br />A lot to discover.</p>
    <h3 class="small-heading">The collection</h3>
    <ul class="library-list">
      <li v-for="item in snapshot.catalog" :key="item.id">
        <button type="button" class="library-item" :aria-current="snapshot.currentId === item.id ? 'true' : undefined"
          @click="host.openPublic(item.id)">
          <span class="accession">{{ item.id }}</span>
          <span class="library-item-name">{{ item.name }}<small>{{ item.topic }}</small></span>
          <span class="availability" :class="{ 'is-saved': savedIds.has(item.id) }" role="img"
            :aria-label="savedIds.has(item.id) ? 'Saved on this device' : item.id === '1CRN' ? 'Bundled example' : 'Not downloaded'" />
        </button>
      </li>
    </ul>
    <template v-if="additional.length > 0">
      <h3 class="small-heading">Your structures</h3>
      <ul class="library-list saved-list">
        <li v-for="item in additional" :key="item.id">
          <button type="button" class="library-item" :aria-current="snapshot.currentId === item.id ? 'true' : undefined"
            @click="host.openSaved(item.id)">
            <LibraryIcon name="folder" />
            <span class="library-item-name">{{ item.label }}<small>{{ item.residueCount.toLocaleString() }} observed residues</small></span>
          </button>
          <button type="button" class="icon-button" :aria-label="`Remove ${item.filename} from device library`"
            @click="host.removeSaved(item.id)"><LibraryIcon name="trash" :size="15" /></button>
        </li>
      </ul>
    </template>
    <button type="button" class="button import-button" @click="host.requestImport()">
      <LibraryIcon name="upload" /> Open a local file
    </button>
    <p class="file-hint">PDB, mmCIF, BinaryCIF<br />Local files stay on this device.</p>
    <div class="library-footer">
      <p>Saved structures work offline once the app is ready for offline use.</p>
      <button type="button" class="text-button" @click="host.clearSaved()">Clear saved files</button>
      <a href="https://www.rcsb.org/" target="_blank" rel="noreferrer">RCSB Protein Data Bank <span aria-hidden="true">↗</span></a>
    </div>
  </aside>
</template>
