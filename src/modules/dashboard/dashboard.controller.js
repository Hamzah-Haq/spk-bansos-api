import * as dashboardService from './dashboard.service.js';

export async function get(req, res) {
  res.json({ data: await dashboardService.getDashboard(req.user) });
}
