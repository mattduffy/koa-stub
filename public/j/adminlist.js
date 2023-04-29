const trashcans = document.querySelectorAll('img.trashcan')

function updateGrid(dataset, targetRow) {
  const div = document.createElement('div')
  div.classList.add('gridspan')
  const text = document.createTextNode(`Permanently deleted ${dataset.username}.  No going back...`)
  div.appendChild(text)
  targetRow.usernameNode.parentNode.insertBefore(div, targetRow.usernameNode)
  targetRow.canNode.firstElementChild.dataset.deleted = true
  function xClick(n) {
    // console.log(n)
    n.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
  }
  xClick(targetRow.usernameNode.firstElementChild)
  xClick(targetRow.viewNode.firstElementChild.firstElementChild)
  xClick(targetRow.editNode.firstElementChild.firstElementChild)
  xClick(targetRow.canNode)
  console.log(div)
}

function doDelete(dataset, row) {
  if (!dataset) {
    console.error('No dataset values provided.  No delete issued.')
    return false
  }
  console.log('doDelete called with: ')
  console.table(dataset)
  updateGrid(dataset, row)
  return true
}

function createDialog(dataset) {
  console.log(this)
  const spanPrompt = document.createElement('span')
  spanPrompt.setAttribute('id', 'prompt')
  const dialogText = `You are about to delete <em>${dataset.username}'s</em> account.<br>`
    + 'This action cannot be undone.<br>'
    + 'Are you sure you want to delete this account?<br>'
  spanPrompt.innerHTML = dialogText
  const spanYes = document.createElement('span')
  spanYes.innerHTML = 'Yes'
  spanYes.setAttribute('id', 'yes')
  spanYes.classList.add('dialogYes')
  const spanNo = document.createElement('span')
  spanNo.innerHTML = 'No'
  spanNo.setAttribute('id', 'no')
  spanNo.classList.add('dialogNo')
  const dialog = document.createElement('dialog')
  dialog.setAttribute('data-uid', dataset.id)
  dialog.appendChild(spanPrompt)
  dialog.appendChild(document.createElement('br'))
  dialog.appendChild(spanNo)
  dialog.appendChild(spanYes)
  document.body.appendChild(dialog)
  spanYes.addEventListener('click', (y) => {
    y.preventDefault()
    y.stopPropagation()
    dialog.close('yes')
  })
  spanNo.addEventListener('click', (n) => {
    n.preventDefault()
    n.stopPropagation()
    dialog.close('no')
  })
  return dialog
}

function canHandler(e, can) {
  e.stopPropagation()
  e.preventDefault()
  if (can.dataset?.deleted === 'true') {
    console.log('trashcan was already clicked.')
  } else {
    const thisRow = {
      canNode: can.parentNode,
      editNode: can.parentNode.previousElementSibling,
      viewNode: can.parentNode.previousElementSibling.previousElementSibling,
      statusNode: can.parentNode.previousElementSibling.previousElementSibling.previousElementSibling,
      usernameNode: can.parentNode.previousElementSibling.previousElementSibling.previousElementSibling.previousElementSibling,
    }
    console.log(thisRow)
    const modalDialog = createDialog(can.dataset)
    modalDialog.addEventListener('close', (c) => {
      console.info(`dialog.returnValue: ${modalDialog.returnValue}`)
      if (modalDialog.returnValue === 'yes') {
        console.log('Dialog Yes clicked')
        doDelete(can.dataset, thisRow)
        // removeEventHandler
      }
    })
    modalDialog.showModal()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  trashcans.forEach((can) => {
    console.log(can.dataset)
    can.addEventListener('click', (e) => {
      canHandler(e, can)
    })
  })
})
