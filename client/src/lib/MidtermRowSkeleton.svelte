<script>
  /** Matches the column the real row adds for those who may delete. */
  export let canDelete = false;
</script>

<tr class="border-b">
  <!-- Col 1: title + subtitle -->
  <td class="py-3 px-4">
    <div class="shimmer h-3.5 w-32"></div>
    <div class="shimmer h-3 w-24 mt-1"></div>
  </td>

  <!-- Col 2: date/time -->
  <td class="py-3 px-4">
    <div class="shimmer h-3 w-3/4"></div>
  </td>

  <!-- Col 3: location -->
  <td class="py-3 px-4">
    <div class="shimmer h-3 w-3/4"></div>
  </td>

  <!-- Col 4: status badge -->
  <td class="py-3 px-4">
    <div class="shimmer h-5 w-16 rounded"></div>
  </td>

  <!-- Col 5: the delete control, present only for those who have one -->
  {#if canDelete}
    <td class="py-3 px-4">
      <div class="shimmer h-6 w-14 rounded ml-auto"></div>
    </td>
  {/if}

</tr>
