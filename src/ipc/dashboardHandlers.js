/**
 * Dashboard IPC Handlers
 */

const { ipcMain } = require('electron');

function db() { return require('../../database/db'); }

module.exports = function setupDashboardHandlers() {
  ipcMain.handle('dashboard:getStats', () => db().getStats());
  
  ipcMain.handle('dashboard:getExecutions', (_, limit = 100) => 
    db().getAllExecutions(limit)
  );

  ipcMain.handle('dashboard:getTaskExecutions', (_, taskId, limit = 10) => 
    db().getExecutionHistory(taskId, limit)
  );

  ipcMain.handle('dashboard:getLogs', (_, limit = 100, level = null) => 
    db().getSystemLogs(limit, level)
  );

  ipcMain.handle('dashboard:getDeliveryStatus', (_, executionId) => 
    db().getDeliveryStatus(executionId)
  );

  ipcMain.handle('dashboard:cleanupLogs', (_, daysOld = 30) => 
    db().cleanupOldLogs(daysOld)
  );

  console.log('[IPC] Dashboard handlers registered');
};
