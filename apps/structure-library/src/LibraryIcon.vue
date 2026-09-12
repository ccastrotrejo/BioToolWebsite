<script setup lang="ts">
const paths = {
  search: 'M21 21l-5-5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  right: 'M9 5l7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  folder: 'M3 6h7l2 3h9v11H3V6Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
} as const;

withDefaults(defineProps<{ name: keyof typeof paths; size?: number }>(), { size: 18 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
