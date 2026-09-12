<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LibraryCatalogItem, LibraryHost } from '@biotool/contracts';
import { normalizeAccession } from '@biotool/core/accession';
import LibraryIcon from './LibraryIcon.vue';

const props = defineProps<{
  catalog: readonly LibraryCatalogItem[];
  open: boolean;
  host: LibraryHost;
  idPrefix: string;
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const query = ref('');
const error = ref<string | null>(null);
const matches = computed(() => {
  const term = query.value.trim().toLowerCase();
  return props.catalog.filter((item) => `${item.id} ${item.name} ${item.topic}`.toLowerCase().includes(term));
});
let sessionOpen = false;
let disposed = false;
let returnFocus: HTMLElement | null = null;

function restoreFocus() {
  const element = dialog.value;
  const active = element?.ownerDocument.activeElement;
  if (returnFocus?.isConnected && (active === element?.ownerDocument.body || active === returnFocus || (active && element?.contains(active)))) {
    returnFocus.focus({ preventScroll: true });
  }
  returnFocus = null;
}

function closeDialog(notify: boolean) {
  if (disposed || !sessionOpen) return;
  sessionOpen = false;
  if (dialog.value?.open) dialog.value.close();
  restoreFocus();
  if (notify) props.host.closeSearch();
}

function synchronize(open: boolean) {
  if (disposed) return;
  if (!open) {
    closeDialog(false);
    return;
  }
  const element = dialog.value;
  if (!element || sessionOpen) return;
  const active = element.ownerDocument.activeElement;
  returnFocus = active instanceof HTMLElement ? active : null;
  element.showModal();
  sessionOpen = true;
  input.value?.focus({ preventScroll: true });
}

function onNativeClose() {
  // A close event can arrive after the next modal session has already opened.
  if (!dialog.value?.open) closeDialog(true);
}

function onKeydown(event: KeyboardEvent) {
  if (!sessionOpen || disposed) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDialog(true);
    return;
  }
  if (event.key !== 'Tab') return;
  const element = dialog.value;
  const controls = element?.querySelectorAll<HTMLElement>(':is(button, input):not(:disabled)');
  const first = controls?.[0];
  const last = controls?.[controls.length - 1];
  const active = element?.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || !active || !element?.contains(active))) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && (active === last || !active || !element?.contains(active))) {
    event.preventDefault();
    first?.focus();
  }
}

function choose(id: string) {
  if (!sessionOpen || disposed) return;
  query.value = '';
  error.value = null;
  props.host.openPublic(id);
  closeDialog(true);
}

function submit() {
  if (!sessionOpen || disposed) return;
  const example = matches.value.length === 1 ? matches.value[0] : undefined;
  let id: string;
  try {
    id = example?.id ?? normalizeAccession(query.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    return;
  }
  choose(id);
}

onMounted(() => synchronize(props.open));
watch(() => props.open, synchronize, { flush: 'post' });
onBeforeUnmount(() => {
  closeDialog(false);
  disposed = true;
  returnFocus = null;
});
</script>

<template>
  <dialog ref="dialog" class="search-dialog" data-framework="vue" :aria-labelledby="`${idPrefix}-search-title`"
    @cancel.prevent="closeDialog(true)" @close="onNativeClose" @keydown="onKeydown">
    <div class="dialog-heading">
      <h2 :id="`${idPrefix}-search-title`">Open a structure</h2>
      <button type="button" class="icon-button" aria-label="Close structure search" @click="closeDialog(true)">
        <LibraryIcon name="close" />
      </button>
    </div>
    <form @submit.prevent="submit">
      <label :for="`${idPrefix}-accession`">PDB identifier or example name</label>
      <div class="search-field">
        <LibraryIcon name="search" />
        <input :id="`${idPrefix}-accession`" ref="input" v-model="query" @input="error = null"
          placeholder="1CRN, ubiquitin, pdb_00001crn" autocomplete="off" :spellcheck="false"
          :aria-invalid="Boolean(error)" :aria-describedby="`${idPrefix}-accession-help`" />
      </div>
      <p :id="`${idPrefix}-accession-help`" :class="error ? 'error-text' : 'muted'" :role="error ? 'alert' : undefined">
        {{ error ?? 'Public coordinates come from RCSB. A saved copy is used first.' }}
      </p>
      <button class="button primary" type="submit">Open structure <LibraryIcon name="right" /></button>
    </form>
    <h3 class="dialog-subheading">Explore the collection</h3>
    <ul class="search-results">
      <li v-for="item in matches" :key="item.id">
        <button type="button" @click="choose(item.id)">
          <span class="accession">{{ item.id }}</span>
          <span>{{ item.name }}<small>{{ item.topic }}</small></span>
          <LibraryIcon name="right" />
        </button>
      </li>
    </ul>
    <p v-if="matches.length === 0" class="muted">No matching examples. Enter a PDB identifier to load from RCSB.</p>
  </dialog>
</template>
