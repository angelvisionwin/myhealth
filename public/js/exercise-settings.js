(function () {
  'use strict';

  var input = document.getElementById('exercise-search');
  var table = document.getElementById('exercise-table');

  if (!input || !table) {
    return;
  }

  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr[data-name]'));

  input.addEventListener('input', function () {
    var query = input.value.trim().toLowerCase();

    rows.forEach(function (row) {
      row.hidden = query.length > 0 && row.getAttribute('data-name').indexOf(query) === -1;
    });
  });
})();
