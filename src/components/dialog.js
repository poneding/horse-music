export function dialogShell(content, className = 'form-dialog') {
  const dialog = document.createElement('dialog');
  dialog.className = className;
  dialog.innerHTML = content;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach(button => { button.addEventListener('click', () => dialog.close()); });
  dialog.addEventListener('close', () => dialog.remove());
  return dialog;
}
