import { OccupancyWebhookInboxEntity } from '../entities/occupancy-webhook-inbox.entity.js';
import { OccupancyWebhookInboxRepository } from './occupancy-webhook-inbox.repository.js';

describe('OccupancyWebhookInboxRepository', () => {
  it('performs an insert and returns the provided entry', async () => {
    const insert = vi.fn().mockResolvedValue({ identifiers: [] });
    const repository = new OccupancyWebhookInboxRepository({ insert } as never);
    const entry = new OccupancyWebhookInboxEntity();
    entry.eventId = '01K5T2S6C4TZ1K9TR6F89A2M7X';

    await expect(repository.insert(entry)).resolves.toBe(entry);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: entry.eventId,
      }),
    );
  });
});
