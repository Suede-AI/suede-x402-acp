// =============================================================================
// Handler barrel — imports each handler module for side-effect registration.
//
// Each module calls `register("<offering_name>", handler)` from
// ../dispatch.ts at module load. importing this barrel from index.ts ensures
// all 27 offerings (7 consulting + 5 video + 16 music) are registered before
// the agent starts listening.
// =============================================================================

import "./agent_quick_score.js";
import "./acp_performance_audit.js";
import "./acp_offer_optimization.js";
import "./acp_x402_promotion_plan.js";
import "./acp_market_arbitrage_report.js";
import "./acp_buyer_growth_list.js";
import "./acp_agent_setup.js";
import "./general_video.js";
import "./meme_video.js";
import "./product_showcase_video.js";
import "./product_showcase_video_10s.js";
import "./suede_video_generation.js";
import "./suede_music_generation.js";
import "./suede_lyrics.js";
import "./suede_extend.js";
import "./suede_continue.js";
import "./suede_cover.js";
import "./suede_voice_cover.js";
import "./suede_acapella.js";
import "./suede_stems.js";
import "./suede_stems_pro.js";
import "./suede_master_wav.js";
import "./suede_midi.js";
import "./suede_lyric_sync.js";
import "./suede_style_coach.js";
import "./suede_audio_analyze.js";
import "./suede_rights_lookup.js";
