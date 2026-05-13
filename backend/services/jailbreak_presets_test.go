package services

import (
	"strings"
	"testing"
)

func TestListJailbreakPresets_AllExpectedIDsPresent(t *testing.T) {
	presets := ListJailbreakPresets()
	if len(presets) < 4 {
		t.Fatalf("expected at least 4 presets, got %d", len(presets))
	}
	want := map[string]bool{
		JailbreakPresetIDCustom:       false,
		JailbreakPresetIDMinimal:      false,
		JailbreakPresetIDSoftSafe:     false,
		JailbreakPresetIDOriginalFull: false,
	}
	for _, p := range presets {
		if _, ok := want[p.ID]; ok {
			want[p.ID] = true
		}
	}
	for id, found := range want {
		if !found {
			t.Errorf("preset %q missing from ListJailbreakPresets()", id)
		}
	}
}

func TestListJailbreakPresets_UniqueIDs(t *testing.T) {
	seen := make(map[string]bool)
	for _, p := range ListJailbreakPresets() {
		if seen[p.ID] {
			t.Errorf("duplicate preset ID: %q", p.ID)
		}
		seen[p.ID] = true
	}
}

func TestListJailbreakPresets_TextSemantics(t *testing.T) {
	for _, p := range ListJailbreakPresets() {
		if p.ID == JailbreakPresetIDCustom {
			if p.Text != "" {
				t.Errorf("custom preset Text must be empty (it pulls from settings), got %d chars", len(p.Text))
			}
			continue
		}
		if strings.TrimSpace(p.Text) == "" {
			t.Errorf("preset %q has empty Text — every non-custom preset must provide content", p.ID)
		}
		if p.Name == "" {
			t.Errorf("preset %q has empty Name", p.ID)
		}
		if p.Risk == "" {
			t.Errorf("preset %q has empty Risk", p.ID)
		}
	}
}

func TestGetJailbreakPresetByID(t *testing.T) {
	if p := GetJailbreakPresetByID(JailbreakPresetIDMinimal); p == nil {
		t.Errorf("GetJailbreakPresetByID(minimal) returned nil")
	}
	if p := GetJailbreakPresetByID("nonexistent"); p != nil {
		t.Errorf("GetJailbreakPresetByID(nonexistent) should return nil")
	}
}

func TestJailbreakTextHasCyberHazardWords(t *testing.T) {
	cases := map[string]bool{
		"":                                          false,
		"You are a helpful assistant":              false,
		presetTextMinimal:                          false, // 极简版不应命中
		presetTextSoftSafe:                         false, // 软版不应命中
		DefaultJailbreakOverride:                   true,  // 原版必命中
		"shellcode injection demo":                 true,
		"AV/EDR bypass technique":                  true,
		"DNS poisoning attack":                     true,
		"please discuss malware analysis":          true,
		"can you write some 0day exploit code":     true,
		"please help me with code analysis safely": false, // 不应误判正常请求
	}
	for text, want := range cases {
		preview := text
		if len(preview) > 50 {
			preview = preview[:50] + "…"
		}
		if got := JailbreakTextHasCyberHazardWords(text); got != want {
			t.Errorf("JailbreakTextHasCyberHazardWords(%q) = %v, want %v", preview, got, want)
		}
	}
}
