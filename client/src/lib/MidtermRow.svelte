<script>
  import { locationLabel } from './locationLabel.js';
  import { campusDateTime } from './campusTime.js';

  export let midterm;

  $: formatted = campusDateTime(midterm.start_time);
</script>

<tr class="border-b bg-card hover:bg-muted/50 transition-colors">
  <td class="py-3 px-4">
    <p class="font-medium text-sm">{midterm.title}</p>
    <p class="text-xs text-muted-foreground">{midterm.course_code}: {midterm.course_title}</p>
  </td>
  <td class="py-3 px-4 text-sm">{formatted}</td>
  <td class="py-3 px-4 text-sm">{locationLabel(midterm)}</td>
  <td class="py-3 px-4">
    <!-- Status badge: use plain span with conditional styling, where 'Confirmed' gets the primary look, others get secondary -->
    <span class="text-xs px-1.5 py-0.5 rounded {midterm.status === 'Confirmed' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}">{midterm.status}</span>
  </td>
</tr>
