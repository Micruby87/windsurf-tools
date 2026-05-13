package services

import (
	"sync"
	"testing"
	"time"
)

func TestJailbreakStats_RecordAndSnapshot(t *testing.T) {
	s := &JailbreakStats{}
	snap := s.snapshot()
	if snap.TotalInjects != 0 || snap.TodayInjects != 0 {
		t.Errorf("initial stats should be zero, got %+v", snap)
	}
	if snap.SinceLastInjectMs != -1 {
		t.Errorf("never-injected since=%d, want -1", snap.SinceLastInjectMs)
	}

	s.record()
	snap = s.snapshot()
	if snap.TotalInjects != 1 {
		t.Errorf("after 1 record, total=%d, want 1", snap.TotalInjects)
	}
	if snap.TodayInjects != 1 {
		t.Errorf("after 1 record, today=%d, want 1", snap.TodayInjects)
	}
	if snap.LastInjectAt == "" {
		t.Errorf("LastInjectAt should be set after record")
	}
	if snap.SinceLastInjectMs < 0 || snap.SinceLastInjectMs > 5000 {
		t.Errorf("SinceLastInjectMs should be reasonable, got %d", snap.SinceLastInjectMs)
	}
}

func TestJailbreakStats_ConcurrentRecord(t *testing.T) {
	s := &JailbreakStats{}
	const goroutines = 50
	const perGoroutine = 100
	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < perGoroutine; j++ {
				s.record()
			}
		}()
	}
	wg.Wait()
	want := int64(goroutines * perGoroutine)
	if got := s.totalInjects.Load(); got != want {
		t.Errorf("concurrent total: got %d, want %d", got, want)
	}
}

func TestJailbreakStats_SnapshotConcurrentSafe(t *testing.T) {
	s := &JailbreakStats{}
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
				s.record()
			}
		}
	}()
	// 持续 read 几百次，验证不会触发 race detector / panic
	for i := 0; i < 500; i++ {
		_ = s.snapshot()
		time.Sleep(time.Microsecond)
	}
	close(stop)
}

func TestJailbreakStats_DayBoundaryReset(t *testing.T) {
	s := &JailbreakStats{}
	// 模拟昨天的记录
	yesterday := time.Now().Add(-25 * time.Hour)
	dayStart := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, yesterday.Location()).Unix()
	s.todayMu.Lock()
	s.todayStartUnix = dayStart
	s.todayInjects = 5
	s.todayMu.Unlock()

	// snapshot 应该把 today 钳到 0（跨天后还没新注入）
	snap := s.snapshot()
	if snap.TodayInjects != 0 {
		t.Errorf("after day boundary with no new records, today should be 0, got %d", snap.TodayInjects)
	}

	// 现在 record 一次，应当看到 today=1，且 dayStart 被更新到今天
	s.record()
	snap = s.snapshot()
	if snap.TodayInjects != 1 {
		t.Errorf("after new record, today should be 1, got %d", snap.TodayInjects)
	}
	now := time.Now()
	wantDayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	s.todayMu.RLock()
	gotDayStart := s.todayStartUnix
	s.todayMu.RUnlock()
	if gotDayStart != wantDayStart {
		t.Errorf("dayStart not refreshed: got %d, want %d", gotDayStart, wantDayStart)
	}
}
