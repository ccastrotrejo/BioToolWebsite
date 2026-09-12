<script setup lang="ts">
import type { LibraryHost, LibrarySnapshot } from '@biotool/contracts';
import LibraryPanel from './LibraryPanel.vue';
import SearchDialog from './SearchDialog.vue';

defineProps<{
  snapshot: LibrarySnapshot;
  host: LibraryHost;
  idPrefix: string;
}>();
</script>

<template>
  <LibraryPanel :snapshot="snapshot" :host="host" :id-prefix="idPrefix" />
  <SearchDialog :catalog="snapshot.catalog" :open="snapshot.searchOpen" :host="host" :id-prefix="idPrefix" />
</template>
